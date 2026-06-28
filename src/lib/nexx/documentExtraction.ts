import { detectDocumentType, type DetectedDocumentType, type DocumentDetectionResult, type ExtractionErrorCode } from './documentTypeDetection';
import { ensurePdfRuntimeReady, isPdfRuntimeError } from './pdfRuntime';
import { extractPdfTextWithMistralOcr, shouldTryMistralOcrForPdf } from './mistralOcr';

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC_MIME = 'application/msword';
const TXT_MIME = 'text/plain';
const MIN_MEANINGFUL_TEXT_CHARS = 80;
const OCR_PAGE_LIMIT = 8;
const OCR_IMAGE_WIDTH = 1400;
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
  ocrProvider?: 'mistral';
  ocrModel?: string;
  ocrRequestMode?: 'base64_stateless';
  ocrAverageConfidence?: number;
  ocrMinConfidence?: number;
  ocrUsagePages?: number;
  ocrUsageBytes?: number;
  estimatedOcrCostUsd?: number;
  ocrBlocksDetected?: number;
  ocrTablesDetected?: number;
  ocrProviderRequestId?: string;
};

/** Normalize provider/parser text into a stable plain-text payload. */
function normalizeText(text: string) {
  return text.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim();
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
    }, { timeout: 30_000 });
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
    };
  } catch (err) {
    console.warn('[DocumentExtraction] OpenAI PDF file extraction failed:', err);
    return {
      error: 'AI PDF extraction failed for this PDF.',
      ocrAttempted: true,
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

/** Render scanned PDF pages and OCR them with OpenAI vision. */
async function extractPdfTextFromImages(buffer: Buffer): Promise<DocumentExtractionResult> {
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
    const screenshots = await pdf.getScreenshot({
      first: OCR_PAGE_LIMIT,
      desiredWidth: OCR_IMAGE_WIDTH,
      imageBuffer: false,
      imageDataUrl: true,
    });

    if (screenshots.pages.length === 0) {
      return {
        error: 'No pages were available for OCR.',
        ocrAttempted: true,
        pagesOcrProcessed: 0,
        pagesTotal: screenshots.total,
      };
    }

    const client = new OpenAI({ apiKey, maxRetries: 1, timeout: 60_000 });
    const pageParts = screenshots.pages.flatMap((page) => ([
      { type: 'input_text' as const, text: `Page ${page.pageNumber}` },
      { type: 'input_image' as const, image_url: page.dataUrl, detail: 'high' as const },
    ]));

    const response = await client.responses.create({
      model: 'gpt-5.4-mini',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                'Extract the visible text from these scanned legal document pages.',
                'Return only the OCR text, preserving page labels, captions, dates, party names, numbered paragraphs, and tables as plain text.',
                'If a word is unclear, use [unclear]. Do not summarize or add legal analysis.',
              ].join(' '),
            },
            ...pageParts,
          ],
        },
      ],
    });

    const text = normalizeText(response.output_text ?? '');
    if (!text) {
      return {
        error: 'OCR completed but did not return readable text.',
        ocrAttempted: true,
        pagesOcrProcessed: screenshots.pages.length,
        pagesTotal: screenshots.total,
      };
    }

    const limitNote = screenshots.total > screenshots.pages.length
      ? `\n\n[OCR processed the first ${screenshots.pages.length} of ${screenshots.total} pages. Upload a smaller split PDF if later pages are needed immediately.]`
      : '';

    return {
      text: `${text}${limitNote}`,
      method: 'ocr',
      ocrAttempted: true,
      pagesOcrProcessed: screenshots.pages.length,
      pagesTotal: screenshots.total,
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
    return text
      ? { text, method: 'txt', detectedType: detection.detectedType, warnings: detection.warnings }
      : { error: 'The text file is empty.', errorCode: 'EXTRACTION_EMPTY', detectedType: detection.detectedType, warnings: detection.warnings };
  }

  if (isPdf(file, detection)) {
    let pdfParserError: string | undefined;
    let pdfParserRuntimeFailure: string | undefined;
    let mistralOcrError: string | undefined;

    try {
      await ensurePdfRuntimeReady();
      const { PDFParse } = await import('pdf-parse');
      const pdf = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await pdf.getText();
      const text = normalizeText(result.text ?? '');
      if (text.length >= MIN_MEANINGFUL_TEXT_CHARS) {
        if (shouldTryMistralOcrForPdf({
          nativeTextLength: text.length,
          nativeSucceeded: true,
        })) {
          const mistralOcr = await extractPdfTextWithMistralOcr({
            buffer,
            filename: file.name,
            mimeType: file.type,
          });
          if (mistralOcr.text) {
            return {
              ...mistralOcr,
              detectedType: detection.detectedType,
              warnings: [
                ...detection.warnings,
                'NATIVE_PDF_TEXT_AVAILABLE_MISTRAL_OCR4_USED_FOR_STRUCTURE',
                ...(mistralOcr.warnings ?? []),
              ],
            };
          }
          mistralOcrError = mistralOcr.error;
          return {
            text,
            method: 'pdf_text',
            ocrAttempted: true,
            detectedType: detection.detectedType,
            warnings: [
              ...detection.warnings,
              'MISTRAL_OCR4_FAILED_FALLING_BACK_TO_NATIVE_TEXT',
              ...(mistralOcr.warnings ?? []),
            ],
          };
        }
        return { text, method: 'pdf_text', detectedType: detection.detectedType, warnings: detection.warnings };
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

    const fileInputExtraction = await extractPdfTextWithOpenAIFileInput(buffer);
    if (fileInputExtraction.text) {
      return {
        ...fileInputExtraction,
        method: 'pdf_file_input',
        detectedType: detection.detectedType,
        warnings: [
          ...detection.warnings,
          ...(pdfParserError ? ['PDF_LOCAL_TEXT_EXTRACTION_FAILED'] : []),
        ],
      };
    }

    const ocr = await extractPdfTextFromImages(buffer);
    if (ocr.text) {
      return {
        ...ocr,
        method: 'pdf_ocr',
        detectedType: detection.detectedType,
        warnings: [
          ...detection.warnings,
          ...(pdfParserError ? ['PDF_LOCAL_TEXT_EXTRACTION_FAILED'] : []),
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

  if (isDocx(file, detection)) {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      const text = normalizeText(result.value ?? '');
      return text
        ? { text, method: 'docx_native', detectedType: detection.detectedType, warnings: detection.warnings }
        : { error: 'No readable text was found in this DOCX file.', errorCode: 'EXTRACTION_EMPTY', detectedType: detection.detectedType, warnings: detection.warnings };
    } catch (err) {
      console.warn('[DocumentExtraction] DOCX text extraction failed:', err);
      return { error: 'DOCX text extraction failed.', errorCode: 'CORRUPT_FILE', detectedType: detection.detectedType, warnings: detection.warnings };
    }
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
