import type { ExtractionErrorCode } from './documentTypeDetection';

export type PdfRuntimeFailureKind =
  | 'runtime_missing_dommatrix'
  | 'runtime_missing_canvas'
  | 'dependency_import_failed';

export class PdfRuntimeError extends Error {
  readonly kind: PdfRuntimeFailureKind;
  readonly errorCode: ExtractionErrorCode = 'UNKNOWN_EXTRACTION_ERROR';

  constructor(message: string, readonly cause?: unknown, kind: PdfRuntimeFailureKind = 'dependency_import_failed') {
    super(message);
    this.name = 'PdfRuntimeError';
    this.kind = kind;
  }
}

let pdfRuntimeReadyPromise: Promise<void> | null = null;

function missingPdfGlobals() {
  const globals = globalThis as Record<string, unknown>;
  return ['DOMMatrix', 'ImageData', 'Path2D'].filter((name) => typeof globals[name] === 'undefined');
}

/** Ensure PDF.js/pdf-parse can import inside a Node action before parser code runs. */
export async function ensurePdfRuntimeReady() {
  if (pdfRuntimeReadyPromise) return pdfRuntimeReadyPromise;

  pdfRuntimeReadyPromise = (async () => {
    const missingBefore = missingPdfGlobals();
    if (missingBefore.length > 0) {
      try {
        const canvas = await import('@napi-rs/canvas') as Record<string, unknown>;
        const globals = globalThis as Record<string, unknown>;
        for (const name of missingBefore) {
          if (typeof globals[name] === 'undefined' && canvas[name]) {
            globals[name] = canvas[name];
          }
        }
      } catch (error) {
        throw new PdfRuntimeError(
          'Unable to load the native canvas package required for PDF processing.',
          error,
          'runtime_missing_canvas',
        );
      }
    }

    const missingAfter = missingPdfGlobals();
    if (missingAfter.length > 0) {
      throw new PdfRuntimeError(
        `PDF runtime missing required globals: ${missingAfter.join(', ')}`,
        undefined,
        missingAfter.includes('DOMMatrix') ? 'runtime_missing_dommatrix' : 'runtime_missing_canvas',
      );
    }

    try {
      await import('pdfjs-dist/legacy/build/pdf.mjs');
    } catch (error) {
      throw new PdfRuntimeError(
        'Unable to import the PDF.js legacy build for PDF processing.',
        error,
        'dependency_import_failed',
      );
    }
  })();

  return pdfRuntimeReadyPromise;
}

export function isPdfRuntimeError(error: unknown): error is PdfRuntimeError {
  return error instanceof PdfRuntimeError;
}
