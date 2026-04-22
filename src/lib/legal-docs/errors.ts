/**
 * Legal Document Generation Errors
 *
 * Typed error class with standardized codes for every failure
 * point in the legal PDF generation pipeline. Used by the
 * orchestrator — never thrown from routes directly.
 */

// ═══════════════════════════════════════════════════════════════
// Error Codes
// ═══════════════════════════════════════════════════════════════

export type LegalGenerationErrorCode =
  | 'LEGAL_DOCUMENT_CLASSIFICATION_FAILED'
  | 'LEGAL_DOCUMENT_PARSE_FAILED'
  | 'LEGAL_DOCUMENT_PROFILE_RESOLUTION_FAILED'
  | 'LEGAL_DOCUMENT_VALIDATION_FAILED'
  | 'LEGAL_DOCUMENT_RENDER_TOO_SHORT'
  | 'LEGAL_DOCUMENT_RENDER_STRUCTURE_INVALID'
  | 'LEGAL_DOCUMENT_PDF_RENDER_FAILED'
  | 'LEGAL_DOCUMENT_PDF_INVALID'
  | 'LEGAL_DOCUMENT_FILENAME_FAILED';

// ═══════════════════════════════════════════════════════════════
// Error Class
// ═══════════════════════════════════════════════════════════════

/**
 * Typed error thrown by the legal PDF generation pipeline.
 *
 * Every failure maps to a standardized `code` for observability
 * and error handling. Routes can switch on `error.code` to
 * return appropriate HTTP status codes.
 */
export class LegalDocumentGenerationError extends Error {
  readonly code: LegalGenerationErrorCode;
  readonly details?: unknown;

  constructor(params: {
    code: LegalGenerationErrorCode;
    message: string;
    details?: unknown;
  }) {
    super(params.message);
    this.name = 'LegalDocumentGenerationError';
    this.code = params.code;
    this.details = params.details;
  }
}
