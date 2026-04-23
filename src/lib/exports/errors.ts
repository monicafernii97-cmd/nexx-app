/**
 * Export Document Generation Errors
 *
 * Typed error class with standardized codes for every failure
 * point in the export PDF generation pipeline.
 *
 * Mirrors the QG `LegalDocumentGenerationError` pattern.
 * Used by the orchestrator — never thrown from routes directly.
 */

// ═══════════════════════════════════════════════════════════════
// Error Codes
// ═══════════════════════════════════════════════════════════════

export type ExportGenerationErrorCode =
  | 'EXPORT_ADAPTATION_FAILED'
  | 'EXPORT_PROFILE_RESOLUTION_FAILED'
  | 'EXPORT_PROFILE_INVALID_FOR_PATH'
  | 'EXPORT_DOCUMENT_VALIDATION_FAILED'
  | 'EXPORT_RENDER_TOO_SHORT'
  | 'EXPORT_RENDER_STRUCTURE_INVALID'
  | 'EXPORT_PDF_RENDER_FAILED'
  | 'EXPORT_PDF_INVALID'
  | 'EXPORT_FILENAME_FAILED'
  | 'EXPORT_UPLOAD_FAILED'
  | 'EXPORT_FINALIZE_FAILED'
  | 'EXPORT_OVERRIDE_NORMALIZATION_FAILED'
  | 'EXPORT_IDEMPOTENCY_CONFLICT'
  | 'EXPORT_ARTIFACT_INTEGRITY_FAILED';

// ═══════════════════════════════════════════════════════════════
// Error Class
// ═══════════════════════════════════════════════════════════════

/**
 * Typed error thrown by the export PDF generation pipeline.
 *
 * Every failure maps to a standardized `code` for observability
 * and error handling. Routes can switch on `error.code` to
 * return appropriate HTTP status codes.
 */
export class ExportDocumentGenerationError extends Error {
  readonly code: ExportGenerationErrorCode;
  readonly details?: unknown;

  constructor(params: {
    code: ExportGenerationErrorCode;
    message: string;
    details?: unknown;
  }) {
    super(params.message);
    this.name = 'ExportDocumentGenerationError';
    this.code = params.code;
    this.details = params.details;
  }
}

/**
 * Map an unknown error to an ExportDocumentGenerationError.
 * Preserves existing ExportDocumentGenerationError instances.
 */
export function mapToExportGenerationError(
  error: unknown,
  fallbackCode: ExportGenerationErrorCode = 'EXPORT_PDF_RENDER_FAILED',
): ExportDocumentGenerationError {
  if (error instanceof ExportDocumentGenerationError) return error;

  const message = error instanceof Error ? error.message : String(error);
  return new ExportDocumentGenerationError({
    code: fallbackCode,
    message,
    details: error,
  });
}
