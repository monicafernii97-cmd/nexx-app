const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC_MIME = 'application/msword';
const TXT_MIME = 'text/plain';
const MIN_MEANINGFUL_TEXT_CHARS = 80;
const OCR_PAGE_LIMIT = 8;
const OCR_IMAGE_WIDTH = 1400;

/** Structured extraction result used by upload and document-analysis routes. */
export type DocumentExtractionResult = {
  text?: string;
  error?: string;
  method?: 'text' | 'ocr';
  ocrAttempted?: boolean;
  pagesOcrProcessed?: number;
  pagesTotal?: number;
};

/** Normalize provider/parser text into a stable plain-text payload. */
function normalizeText(text: string) {
  return text.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim();
}

/** Return true when a file should be treated as a PDF, even with missing MIME. */
function isPdf(file: File) {
  return file.type === PDF_MIME || file.name.toLowerCase().endsWith('.pdf');
}

/** Return true when a file should be treated as DOCX, even with missing MIME. */
function isDocx(file: File) {
  return file.type === DOCX_MIME || file.name.toLowerCase().endsWith('.docx');
}

/** Return true when a file should be handled as plain text. */
function isText(file: File) {
  return file.type === TXT_MIME || file.name.toLowerCase().endsWith('.txt');
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
export async function extractDocumentText(file: File): Promise<DocumentExtractionResult> {
  if (isText(file)) {
    const text = normalizeText(await file.text());
    return text ? { text, method: 'text' } : { error: 'The text file is empty.' };
  }

  if (isPdf(file)) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { PDFParse } = await import('pdf-parse');
      const pdf = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await pdf.getText();
      const text = normalizeText(result.text ?? '');
      if (text.length >= MIN_MEANINGFUL_TEXT_CHARS) {
        return { text, method: 'text' };
      }

      const ocr = await extractPdfTextFromImages(buffer);
      if (ocr.text) return ocr;

      return {
        ...ocr,
        error: ocr.error ?? 'No selectable text was found in this PDF, and OCR could not extract readable text.',
      };
    } catch (err) {
      console.warn('[DocumentExtraction] PDF text extraction failed:', err);
      return { error: 'PDF text extraction failed.' };
    }
  }

  if (isDocx(file)) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      const text = normalizeText(result.value ?? '');
      return text
        ? { text, method: 'text' }
        : { error: 'No readable text was found in this DOCX file.' };
    } catch (err) {
      console.warn('[DocumentExtraction] DOCX text extraction failed:', err);
      return { error: 'DOCX text extraction failed.' };
    }
  }

  if (file.type === DOC_MIME || file.name.toLowerCase().endsWith('.doc')) {
    return { error: 'Legacy DOC files can be indexed, but text preview extraction is not available.' };
  }

  return { error: 'Unsupported document type.' };
}

export function buildDocumentContextSnippet(text: string, maxChars = 12000) {
  const normalized = normalizeText(text);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trim()}\n\n[Document text truncated after ${maxChars.toLocaleString()} characters. Use the indexed upload for more detail.]`;
}
