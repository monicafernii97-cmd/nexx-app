import { detectDocumentType, type DetectedDocumentType, type DocumentDetectionResult, type ExtractionErrorCode } from './documentTypeDetection';
import { ensurePdfRuntimeReady, isPdfRuntimeError } from './pdfRuntime';
import { extractPdfTextWithMistralOcr, shouldTryMistralOcrForPdf } from './mistralOcr';
import {
  buildPageCoverageReceipt,
  buildTextCoverageReceipt,
  type CanonicalExtractedPage,
  type CanonicalExtractedTextUnit,
  type DocumentCoverageReceipt,
} from './documentExtractionTypes';
import { extractSimpleDocumentText, extractZipDocumentContainer, type EmbeddedDocumentImage } from './documentContainerExtraction';

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC_MIME = 'application/msword';
const TXT_MIME = 'text/plain';
const MIN_MEANINGFUL_TEXT_CHARS = 80;
const MIN_MEANINGFUL_PAGE_TEXT_CHARS = 40;
const OCR_IMAGE_WIDTH = 1400;
const OCR_RENDER_BATCH_SIZE = 6;
const OCR_REQUEST_CONCURRENCY = 3;
const PDF_FILE_EXTRACTION_TIMEOUT_MS = 90_000;

/** Structured extraction result used by upload and document-analysis routes. */
export type DocumentExtractionResult = {
  text?: string;
  error?: string;
  errorCode?: ExtractionErrorCode;
  method?: string;
  detectedType?: DetectedDocumentType;
  ocrAttempted?: boolean;
  pagesOcrProcessed?: number;
  pagesTotal?: number;
  warnings?: string[];
  ocrProvider?: 'mistral' | 'openai';
  ocrModel?: string;
  ocrRequestMode?: 'base64_stateless' | 'file_input';
  ocrAverageConfidence?: number;
  ocrMinConfidence?: number;
  ocrUsagePages?: number;
  ocrUsageBytes?: number;
  estimatedOcrCostUsd?: number;
  ocrBlocksDetected?: number;
  ocrTablesDetected?: number;
  ocrProviderRequestId?: string;
  pages?: CanonicalExtractedPage[];
  coverage?: DocumentCoverageReceipt;
  sourceUnits?: CanonicalExtractedTextUnit[];
};

/** Normalize provider/parser text into a stable plain-text payload. */
function normalizeText(text: string) {
  return text.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim();
}

function buildPageLabeledText(pages: CanonicalExtractedPage[]) {
  return normalizeText(pages
    .filter((page) => page.canonicalText)
    .map((page) => `[Page ${page.pageNumber}]\n\n${page.canonicalText}`)
    .join('\n\n'));
}

function nativePdfPages(result: { pages: Array<{ num: number; text: string }>; total: number }) {
  const pageByNumber = new Map(result.pages.map((page) => [page.num, normalizeText(page.text ?? '')]));
  return Array.from({ length: result.total }, (_, index): CanonicalExtractedPage => {
    const pageNumber = index + 1;
    const canonicalText = pageByNumber.get(pageNumber) ?? '';
    return {
      pageNumber,
      sourcePageIndex: index,
      nativeText: canonicalText || undefined,
      canonicalText,
      canonicalSource: 'native',
      status: canonicalText.length >= MIN_MEANINGFUL_PAGE_TEXT_CHARS ? 'succeeded' : 'failed',
      warnings: canonicalText.length >= MIN_MEANINGFUL_PAGE_TEXT_CHARS
        ? []
        : ['NATIVE_PDF_PAGE_REQUIRES_OCR'],
    };
  });
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Return true when a file should be treated as a PDF, even with missing MIME. */
function isPdf(file: File, detection?: DocumentDetectionResult) {
  return detection?.detectedType === 'pdf' || file.type === PDF_MIME || file.name.toLowerCase().endsWith('.pdf');
}

/** Return true when a file should be treated as DOCX, even with missing MIME. */
function isDocx(file: File, detection?: DocumentDetectionResult) {
  return detection?.detectedType === 'docx' || file.type === DOCX_MIME || file.name.toLowerCase().endsWith('.docx');
}

/** Return true when a file should be handled as plain text. */
function isText(file: File, detection?: DocumentDetectionResult) {
  return detection?.detectedType === 'txt' || file.type === TXT_MIME || file.name.toLowerCase().endsWith('.txt');
}

function singleTextUnit(text: string, label = 'Document text'): CanonicalExtractedTextUnit[] {
  return [{
    unitIndex: 0, unitLabel: label, text, status: text ? 'succeeded' : 'failed',
    nativeTextChars: text.length, canonicalTextChars: text.length, ocrApplied: false, warnings: [],
  }];
}

async function normalizeImageForOcr(image: EmbeddedDocumentImage) {
  if (image.mimeType !== 'image/tiff') return image;
  const { default: sharp } = await import('sharp');
  const bytes = await sharp(image.bytes, { animated: true, pages: 1 }).png().toBuffer();
  return { ...image, mimeType: 'image/png', bytes: new Uint8Array(bytes) };
}

function inferImageMime(buffer: Buffer, declared: string) {
  if (declared.startsWith('image/')) return declared;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
  if (buffer.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif';
  if ((buffer[0] === 0x49 && buffer[1] === 0x49) || (buffer[0] === 0x4d && buffer[1] === 0x4d)) return 'image/tiff';
  return 'image/jpeg';
}

async function ocrImageUnit(image: EmbeddedDocumentImage, unitIndex: number): Promise<CanonicalExtractedTextUnit> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { unitIndex, unitLabel: image.label, text: '', status: 'failed', nativeTextChars: 0, canonicalTextChars: 0, ocrApplied: false, warnings: ['IMAGE_OCR_UNAVAILABLE'] };
  try {
    const normalized = await normalizeImageForOcr(image);
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey, maxRetries: 1, timeout: 75_000 });
    const response = await client.responses.create({
      model: 'gpt-5.4-mini',
      input: [{ role: 'user', content: [
        { type: 'input_text', text: 'OCR this document image. Return only visible text, preserving headings, fields, tables, dates, names, signatures, and legal provisions. Use [unclear] for uncertain words. If blank, return exactly [NO_READABLE_TEXT].' },
        { type: 'input_image', image_url: `data:${normalized.mimeType};base64,${Buffer.from(normalized.bytes).toString('base64')}`, detail: 'high' },
      ] }],
      max_output_tokens: 8_000,
    });
    const raw = normalizeText(response.output_text ?? '');
    const blank = raw === '[NO_READABLE_TEXT]';
    const text = blank ? '' : raw;
    return {
      unitIndex, unitLabel: image.label, text,
      status: blank ? 'verified_blank' : text ? 'succeeded' : 'failed',
      nativeTextChars: 0, canonicalTextChars: text.length, ocrApplied: true,
      warnings: blank ? ['OCR_VERIFIED_BLANK_IMAGE'] : text ? [] : ['IMAGE_OCR_EMPTY'],
    };
  } catch (error) {
    console.warn('[DocumentExtraction] Embedded image OCR failed', { label: image.label, error: error instanceof Error ? error.message : String(error) });
    return { unitIndex, unitLabel: image.label, text: '', status: 'failed', nativeTextChars: 0, canonicalTextChars: 0, ocrApplied: true, warnings: ['IMAGE_OCR_FAILED'] };
  }
}

async function extractContainerDocument(buffer: Buffer, type: DetectedDocumentType, detectionWarnings: string[]): Promise<DocumentExtractionResult> {
  try {
    const container = await extractZipDocumentContainer(buffer, type);
    const indexedImages = container.images.map((image, imageIndex) => ({ image, imageIndex }));
    const imageUnits = await mapWithConcurrency(indexedImages, OCR_REQUEST_CONCURRENCY,
      ({ image, imageIndex }) => ocrImageUnit(image, container.units.length + imageIndex));
    const sourceUnits = [...container.units, ...imageUnits];
    const text = normalizeText(sourceUnits.filter((sourceUnit) => sourceUnit.text).map((sourceUnit) => `[${sourceUnit.unitLabel}]\n${sourceUnit.text}`).join('\n\n'));
    const coverage = buildTextCoverageReceipt(sourceUnits);
    return text ? {
      text, method: `${type}_structured`, detectedType: type,
      ocrAttempted: container.images.length > 0,
      ocrProvider: container.images.length > 0 ? 'openai' : undefined,
      ocrModel: container.images.length > 0 ? 'gpt-5.4-mini' : undefined,
      ocrRequestMode: container.images.length > 0 ? 'base64_stateless' : undefined,
      pagesOcrProcessed: imageUnits.length,
      warnings: [...detectionWarnings, ...container.warnings, ...coverage.warnings],
      sourceUnits, coverage,
    } : {
      error: 'No readable text was found in this document.', errorCode: 'EXTRACTION_EMPTY', detectedType: type,
      warnings: [...detectionWarnings, ...container.warnings, ...coverage.warnings], sourceUnits, coverage,
    };
  } catch (error) {
    console.warn('[DocumentExtraction] Structured container extraction failed', error);
    return { error: 'This document container is corrupted or could not be read.', errorCode: 'CORRUPT_FILE', detectedType: type, warnings: detectionWarnings };
  }
}

/** Ask OpenAI to read a PDF directly when local text extraction finds no selectable text. */
async function extractPdfTextWithOpenAIFileInput(buffer: Buffer): Promise<DocumentExtractionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      error: 'This PDF appears to have no selectable text, and AI PDF extraction is unavailable because OPENAI_API_KEY is not configured.',
      ocrAttempted: false,
    };
  }

  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({
    apiKey,
    maxRetries: 1,
    timeout: PDF_FILE_EXTRACTION_TIMEOUT_MS,
  });
  let uploadedFileId: string | undefined;
  try {
    const uploadedFile = await client.files.create({
      file: new File([new Uint8Array(buffer)], 'uploaded-document.pdf', { type: PDF_MIME }),
      purpose: 'assistants',
    }, { timeout: 30_000, maxRetries: 0 });
    uploadedFileId = uploadedFile.id;

    const response = await client.responses.create({
      model: 'gpt-5.4-mini',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                'Extract the readable text from this uploaded legal PDF.',
                'Return only the document text as plain text.',
                'Preserve captions, dates, party names, headings, numbered paragraphs, ordered provisions, deadlines, signatures, and tables.',
                'Do not summarize, analyze, or add commentary.',
                'If a word is unclear, write [unclear].',
              ].join(' '),
            },
            {
              type: 'input_file',
              file_id: uploadedFile.id,
            },
          ],
        },
      ],
      max_output_tokens: 20_000,
    }, { timeout: PDF_FILE_EXTRACTION_TIMEOUT_MS });

    const text = normalizeText(response.output_text ?? '');
    if (!text) {
      return {
        error: 'AI PDF extraction completed but did not return readable text.',
        ocrAttempted: true,
      };
    }

    return {
      text,
      method: 'ocr',
      ocrAttempted: true,
      ocrProvider: 'openai',
      ocrModel: 'gpt-5.4-mini',
      ocrRequestMode: 'file_input',
    };
  } catch (err) {
    console.warn('[DocumentExtraction] OpenAI PDF file extraction failed:', err);
    return {
      error: 'AI PDF extraction failed for this PDF.',
      ocrAttempted: true,
      ocrProvider: 'openai',
      ocrModel: 'gpt-5.4-mini',
      ocrRequestMode: 'file_input',
    };
  } finally {
    if (uploadedFileId) {
      try {
        await client.files.delete(uploadedFileId, { timeout: 10_000 });
      } catch (cleanupErr) {
        console.warn('[DocumentExtraction] Failed to clean up PDF extraction file:', uploadedFileId, cleanupErr);
      }
    }
  }
}

/** Render every requested PDF page and OCR it independently with bounded concurrency. */
async function extractPdfTextFromImages(
  buffer: Buffer,
  options: { pageNumbers?: number[]; pagesTotal?: number } = {},
): Promise<DocumentExtractionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      error: 'This PDF appears to be scanned, but OCR is unavailable because OPENAI_API_KEY is not configured.',
      ocrAttempted: false,
    };
  }

  try {
    await ensurePdfRuntimeReady();
    const { PDFParse } = await import('pdf-parse');
    const { default: OpenAI } = await import('openai');
    const pdf = new PDFParse({ data: new Uint8Array(buffer) });
    const info = options.pagesTotal === undefined ? await pdf.getText() : undefined;
    const pagesTotal = options.pagesTotal ?? info?.total ?? 0;
    const requestedPageNumbers = options.pageNumbers ??
      Array.from({ length: pagesTotal }, (_, index) => index + 1);

    if (requestedPageNumbers.length === 0 || pagesTotal === 0) {
      return {
        error: 'No pages were available for OCR.',
        ocrAttempted: true,
        pagesOcrProcessed: 0,
        pagesTotal,
        pages: [],
        coverage: buildPageCoverageReceipt([], pagesTotal),
      };
    }

    const client = new OpenAI({ apiKey, maxRetries: 2, timeout: 75_000 });
    const canonicalPages: CanonicalExtractedPage[] = [];
    for (let start = 0; start < requestedPageNumbers.length; start += OCR_RENDER_BATCH_SIZE) {
      const pageBatch = requestedPageNumbers.slice(start, start + OCR_RENDER_BATCH_SIZE);
      const screenshots = await pdf.getScreenshot({
        partial: pageBatch,
        desiredWidth: OCR_IMAGE_WIDTH,
        imageBuffer: false,
        imageDataUrl: true,
      });
      const extractedBatch = await mapWithConcurrency(
        screenshots.pages,
        OCR_REQUEST_CONCURRENCY,
        async (page): Promise<CanonicalExtractedPage> => {
          try {
            const response = await client.responses.create({
              model: 'gpt-5.4-mini',
              input: [{
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: [
                      `OCR source page ${page.pageNumber} of ${pagesTotal}.`,
                      'Return only the visible legal-document text; preserve captions, dates, names, numbered provisions, signatures, and tables.',
                      'Use [unclear] for uncertain words. If the page is visually blank, return exactly [NO_READABLE_TEXT].',
                      'Do not summarize, analyze, or combine this page with another page.',
                    ].join(' '),
                  },
                  { type: 'input_image', image_url: page.dataUrl, detail: 'high' },
                ],
              }],
              max_output_tokens: 6_000,
            });
            const rawText = normalizeText(response.output_text ?? '');
            const verifiedBlank = rawText === '[NO_READABLE_TEXT]';
            const canonicalText = verifiedBlank ? '' : rawText;
            return {
              pageNumber: page.pageNumber,
              sourcePageIndex: page.pageNumber - 1,
              ocrMarkdown: canonicalText || undefined,
              canonicalText,
              canonicalSource: 'ocr',
              status: verifiedBlank ? 'verified_blank' : canonicalText ? 'succeeded' : 'failed',
              dimensions: { width: page.width, height: page.height },
              warnings: verifiedBlank
                ? ['OCR_VERIFIED_BLANK_PAGE']
                : canonicalText
                  ? []
                  : ['OCR_EMPTY_PAGE'],
            };
          } catch (error) {
            return {
              pageNumber: page.pageNumber,
              sourcePageIndex: page.pageNumber - 1,
              canonicalText: '',
              canonicalSource: 'ocr',
              status: 'failed',
              dimensions: { width: page.width, height: page.height },
              warnings: [error instanceof DOMException && error.name === 'AbortError'
                ? 'OCR_PAGE_TIMEOUT'
                : 'OCR_PAGE_REQUEST_FAILED'],
            };
          }
        },
      );
      canonicalPages.push(...extractedBatch);
    }

    canonicalPages.sort((a, b) => a.pageNumber - b.pageNumber);
    const coverage = buildPageCoverageReceipt(canonicalPages, pagesTotal);
    const text = buildPageLabeledText(canonicalPages);

    return {
      text: text || undefined,
      error: text ? undefined : 'OCR completed but did not return readable text.',
      method: 'ocr',
      ocrAttempted: true,
      ocrProvider: 'openai',
      ocrModel: 'gpt-5.4-mini',
      ocrRequestMode: 'base64_stateless',
      pagesOcrProcessed: canonicalPages.length,
      pagesTotal,
      pages: canonicalPages,
      coverage,
      warnings: coverage.warnings,
    };
  } catch (err) {
    console.warn('[DocumentExtraction] PDF OCR fallback failed:', err);
    if (isPdfRuntimeError(err)) {
      return {
        error: 'OCR could not start because the PDF runtime is missing required parser/canvas dependencies.',
        errorCode: err.errorCode,
        ocrAttempted: false,
        warnings: [err.kind],
      };
    }
    return {
      error: 'OCR fallback failed for this scanned PDF.',
      ocrAttempted: true,
      ocrProvider: 'openai',
      ocrModel: 'gpt-5.4-mini',
      ocrRequestMode: 'base64_stateless',
    };
  }
}

/**
 * Extract plain text from user-uploaded legal documents.
 *
 * This intentionally returns a structured result instead of throwing so upload
 * and chat flows can distinguish "indexed, but no preview text" from a hard
 * upload failure.
 */
export async function extractDocumentText(
  file: File,
  options: { buffer?: Buffer; detection?: DocumentDetectionResult } = {},
): Promise<DocumentExtractionResult> {
  const buffer = options.buffer ?? Buffer.from(await file.arrayBuffer());
  const detection = options.detection ?? detectDocumentType(buffer, {
    filename: file.name,
    mimeType: file.type,
  });

  if (!detection.ok) {
    return {
      error: detection.userMessage ?? 'Unsupported document type.',
      errorCode: detection.errorCode,
      detectedType: detection.detectedType,
      warnings: detection.warnings,
    };
  }

  if (isText(file, detection)) {
    const text = normalizeText(await file.text());
    const sourceUnits = singleTextUnit(text);
    return text
      ? { text, method: 'txt', detectedType: detection.detectedType, warnings: detection.warnings, sourceUnits, coverage: buildTextCoverageReceipt(sourceUnits) }
      : { error: 'The text file is empty.', errorCode: 'EXTRACTION_EMPTY', detectedType: detection.detectedType, warnings: detection.warnings };
  }

  if (['csv', 'html', 'rtf', 'eml'].includes(detection.detectedType)) {
    const text = normalizeText(extractSimpleDocumentText(buffer, detection.detectedType));
    const sourceUnits = singleTextUnit(text, detection.detectedType === 'eml' ? 'Email message' : 'Document text');
    const rawPreview = buffer.subarray(0, Math.min(buffer.length, 2_000_000)).toString('utf8');
    const omittedVisual = detection.detectedType === 'html' && /<img\b/i.test(rawPreview) ||
      detection.detectedType === 'rtf' && /\\pict\b/i.test(rawPreview);
    const omittedEmailAttachment = detection.detectedType === 'eml' && /content-disposition:\s*attachment/i.test(rawPreview);
    if (omittedVisual || omittedEmailAttachment) {
      sourceUnits.push({
        unitIndex: sourceUnits.length,
        unitLabel: omittedEmailAttachment ? 'Email attachment' : 'Embedded visual',
        text: '', status: 'omitted', nativeTextChars: 0, canonicalTextChars: 0,
        ocrApplied: false,
        warnings: [omittedEmailAttachment ? 'EMAIL_ATTACHMENT_REQUIRES_SEPARATE_UPLOAD' : 'EMBEDDED_VISUAL_NOT_EXTRACTED'],
      });
    }
    const coverage = buildTextCoverageReceipt(sourceUnits);
    return text
      ? { text, method: `${detection.detectedType}_native`, detectedType: detection.detectedType, warnings: [...detection.warnings, ...coverage.warnings], sourceUnits, coverage }
      : { error: 'No readable text was found in this document.', errorCode: 'EXTRACTION_EMPTY', detectedType: detection.detectedType, warnings: detection.warnings };
  }

  if (detection.detectedType === 'image') {
    const sourceUnits = [await ocrImageUnit({ label: 'Document image', filename: file.name, mimeType: inferImageMime(buffer, file.type), bytes: new Uint8Array(buffer) }, 0)];
    const text = normalizeText(sourceUnits[0].text);
    const coverage = buildTextCoverageReceipt(sourceUnits);
    return text
      ? { text, method: 'image_ocr', detectedType: 'image', ocrAttempted: true, ocrProvider: 'openai', ocrModel: 'gpt-5.4-mini', ocrRequestMode: 'base64_stateless', pagesOcrProcessed: 1, warnings: [...detection.warnings, ...coverage.warnings], sourceUnits, coverage }
      : { error: 'No readable text was found in this image.', errorCode: 'OCR_EMPTY', detectedType: 'image', ocrAttempted: true, ocrProvider: 'openai', ocrModel: 'gpt-5.4-mini', ocrRequestMode: 'base64_stateless', warnings: [...detection.warnings, ...coverage.warnings], sourceUnits, coverage };
  }

  if (isPdf(file, detection)) {
    let pdfParserError: string | undefined;
    let pdfParserRuntimeFailure: string | undefined;
    let mistralOcrError: string | undefined;
    let parsedPages: CanonicalExtractedPage[] | undefined;
    let parsedPagesTotal: number | undefined;

    try {
      await ensurePdfRuntimeReady();
      const { PDFParse } = await import('pdf-parse');
      const pdf = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await pdf.getText();
      const nativePages = nativePdfPages(result);
      parsedPages = nativePages;
      parsedPagesTotal = result.total;
      const text = buildPageLabeledText(nativePages);
      const lowTextPageNumbers = nativePages
        .filter((page) => page.status !== 'succeeded')
        .map((page) => page.pageNumber);
      if (text.length >= MIN_MEANINGFUL_TEXT_CHARS) {
        if (shouldTryMistralOcrForPdf({
          nativeTextLength: text.length,
          nativeSucceeded: true,
          hasLowTextPages: lowTextPageNumbers.length > 0,
        })) {
          const mistralOcr = await extractPdfTextWithMistralOcr({
            buffer,
            filename: file.name,
            mimeType: file.type,
          });
          if (mistralOcr.text) {
            return {
              ...mistralOcr,
              coverage: buildPageCoverageReceipt(mistralOcr.pages, mistralOcr.pagesTotal),
              detectedType: detection.detectedType,
              warnings: [
                ...detection.warnings,
                'NATIVE_PDF_TEXT_AVAILABLE_MISTRAL_OCR4_USED_FOR_STRUCTURE',
                ...(mistralOcr.warnings ?? []),
              ],
            };
          }
          mistralOcrError = mistralOcr.error;
        }

        if (lowTextPageNumbers.length > 0) {
          const selectiveOcr = await extractPdfTextFromImages(buffer, {
            pageNumbers: lowTextPageNumbers,
            pagesTotal: result.total,
          });
          const ocrByPage = new Map(selectiveOcr.pages?.map((page) => [page.pageNumber, page]));
          const mergedPages = nativePages.map((nativePage): CanonicalExtractedPage => {
            const ocrPage = ocrByPage.get(nativePage.pageNumber);
            if (!ocrPage) return nativePage;
            if (!ocrPage.canonicalText && nativePage.nativeText) {
              return {
                ...nativePage,
                canonicalSource: 'hybrid',
                status: 'low_confidence',
                warnings: Array.from(new Set([
                  ...nativePage.warnings,
                  ...ocrPage.warnings,
                  'SHORT_NATIVE_TEXT_NOT_CONFIRMED_BY_OCR',
                ])),
              };
            }
            return {
              ...ocrPage,
              nativeText: nativePage.nativeText,
              canonicalSource: nativePage.nativeText ? 'hybrid' : 'ocr',
              warnings: Array.from(new Set([...nativePage.warnings, ...ocrPage.warnings])),
            };
          });
          const coverage = buildPageCoverageReceipt(mergedPages, result.total);
          return {
            text: buildPageLabeledText(mergedPages),
            method: 'pdf_hybrid',
            ocrAttempted: true,
            pagesOcrProcessed: selectiveOcr.pagesOcrProcessed ?? 0,
            pagesTotal: result.total,
            pages: mergedPages,
            coverage,
            detectedType: detection.detectedType,
            warnings: [
              ...detection.warnings,
              ...(mistralOcrError ? ['MISTRAL_OCR4_FAILED_FALLING_BACK_TO_PAGE_OCR'] : []),
              ...(selectiveOcr.warnings ?? []),
              ...coverage.warnings,
            ],
          };
        }

        const coverage = buildPageCoverageReceipt(nativePages, result.total);
        return {
          text,
          method: 'pdf_text',
          detectedType: detection.detectedType,
          pagesTotal: result.total,
          pages: nativePages,
          coverage,
          warnings: [...detection.warnings, ...coverage.warnings],
        };
      }
    } catch (err) {
      console.warn('[DocumentExtraction] PDF text extraction failed:', err);
      pdfParserError = err instanceof Error ? err.message : String(err);
      if (isPdfRuntimeError(err)) {
        pdfParserRuntimeFailure = err.kind;
      } else if (pdfParserError.includes('DOMMatrix is not defined')) {
        pdfParserRuntimeFailure = 'runtime_missing_dommatrix';
      }
    }

    if (shouldTryMistralOcrForPdf({
      nativeTextLength: 0,
      parserFailed: Boolean(pdfParserError),
    })) {
      const mistralOcr = await extractPdfTextWithMistralOcr({
        buffer,
        filename: file.name,
        mimeType: file.type,
      });
      if (mistralOcr.text) {
        return {
          ...mistralOcr,
          coverage: buildPageCoverageReceipt(mistralOcr.pages, mistralOcr.pagesTotal),
          detectedType: detection.detectedType,
          warnings: [
            ...detection.warnings,
            ...(pdfParserError ? ['PDF_LOCAL_TEXT_EXTRACTION_FAILED'] : []),
            ...(mistralOcr.warnings ?? []),
          ],
        };
      }
      mistralOcrError = mistralOcr.error;
    }

    const ocr = await extractPdfTextFromImages(buffer, {
      pageNumbers: parsedPages?.map((page) => page.pageNumber),
      pagesTotal: parsedPagesTotal,
    });
    if (ocr.text) {
      return {
        ...ocr,
        method: 'pdf_ocr',
        detectedType: detection.detectedType,
        warnings: [
          ...detection.warnings,
          ...(pdfParserError ? ['PDF_LOCAL_TEXT_EXTRACTION_FAILED'] : []),
          ...(ocr.warnings ?? []),
        ],
      };
    }

    const fileInputExtraction = await extractPdfTextWithOpenAIFileInput(buffer);
    if (fileInputExtraction.text) {
      return {
        ...fileInputExtraction,
        method: 'pdf_file_input_unpaged',
        detectedType: detection.detectedType,
        warnings: [
          ...detection.warnings,
          ...(pdfParserError ? ['PDF_LOCAL_TEXT_EXTRACTION_FAILED'] : []),
          'SOURCE_PAGE_COVERAGE_UNAVAILABLE',
        ],
      };
    }

    return {
      ...ocr,
      errorCode: pdfParserRuntimeFailure ? 'UNKNOWN_EXTRACTION_ERROR' : 'OCR_EMPTY',
      detectedType: detection.detectedType,
      warnings: [
        ...detection.warnings,
        ...(pdfParserError ? ['PDF_LOCAL_TEXT_EXTRACTION_FAILED'] : []),
        ...(pdfParserRuntimeFailure ? [pdfParserRuntimeFailure] : []),
      ],
      error: pdfParserRuntimeFailure
        ? [
          'The file uploaded, but our PDF processor could not read it because a required PDF runtime dependency is missing.',
          'This is a system processing issue, not proof that your PDF has no selectable text.',
          pdfParserError ? `Local PDF parser failed: ${pdfParserError}` : undefined,
          mistralOcrError,
          fileInputExtraction.error,
          ocr.error,
        ].filter(Boolean).join(' ')
        : [
          'No selectable text was found in this PDF, and OCR could not extract readable text.',
          pdfParserError ? `Local PDF parser failed: ${pdfParserError}` : undefined,
          mistralOcrError,
          fileInputExtraction.error,
          ocr.error,
        ].filter(Boolean).join(' '),
    };
  }

  if (isDocx(file, detection) || ['pptx', 'xlsx', 'odt'].includes(detection.detectedType)) {
    return await extractContainerDocument(buffer, detection.detectedType, detection.warnings);
  }

  if (detection.detectedType === 'doc' || file.type === DOC_MIME || file.name.toLowerCase().endsWith('.doc')) {
    return {
      error: 'Legacy DOC files require the hardened document worker before they can be attached to chat.',
      errorCode: 'WORKER_UNAVAILABLE',
      detectedType: detection.detectedType,
      warnings: detection.warnings,
    };
  }

  return { error: 'Unsupported document type.', errorCode: 'UNSUPPORTED_FILE_TYPE', detectedType: detection.detectedType, warnings: detection.warnings };
}

export function buildDocumentContextSnippet(text: string, maxChars = 12000) {
  const normalized = normalizeText(text);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trim()}\n\n[Document text truncated after ${maxChars.toLocaleString()} characters. Use the indexed upload for more detail.]`;
}
