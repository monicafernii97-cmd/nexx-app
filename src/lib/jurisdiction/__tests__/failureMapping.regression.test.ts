/**
 * Failure Mapping Regression Tests
 *
 * Validates that each stage failure in the export pipeline maps
 * to the correct ExportGenerationErrorCode. Ensures the error
 * taxonomy is stable and deterministic.
 */

import { describe, it, expect } from 'vitest';
import {
  ExportDocumentGenerationError,
  mapToExportGenerationError,
  type ExportGenerationErrorCode,
} from '@/lib/exports/errors';

describe('failure mapping — error code taxonomy', () => {
  it('preserves ExportDocumentGenerationError instances', () => {
    const original = new ExportDocumentGenerationError({
      code: 'EXPORT_ADAPTATION_FAILED',
      message: 'test',
    });
    const mapped = mapToExportGenerationError(original);
    expect(mapped).toBe(original);
    expect(mapped.code).toBe('EXPORT_ADAPTATION_FAILED');
  });

  it('maps unknown Error to fallback code', () => {
    const err = new Error('Something broke');
    const mapped = mapToExportGenerationError(err);
    expect(mapped.code).toBe('EXPORT_PDF_RENDER_FAILED'); // default fallback
    expect(mapped.message).toBe('Something broke');
  });

  it('maps non-Error values to fallback code', () => {
    const mapped = mapToExportGenerationError('string error');
    expect(mapped.code).toBe('EXPORT_PDF_RENDER_FAILED');
    expect(mapped.message).toBe('string error');
  });

  it('maps with custom fallback code', () => {
    const mapped = mapToExportGenerationError(new Error('test'), 'EXPORT_FILENAME_FAILED');
    expect(mapped.code).toBe('EXPORT_FILENAME_FAILED');
  });

  describe('all error codes are constructable', () => {
    /**
     * Exhaustive map — any new ExportGenerationErrorCode member
     * that is not added here will cause a TypeScript compile error.
     */
    const allCodes: Record<ExportGenerationErrorCode, true> = {
      EXPORT_ADAPTATION_FAILED: true,
      EXPORT_PROFILE_RESOLUTION_FAILED: true,
      EXPORT_PROFILE_INVALID_FOR_PATH: true,
      EXPORT_DOCUMENT_VALIDATION_FAILED: true,
      EXPORT_RENDER_TOO_SHORT: true,
      EXPORT_RENDER_STRUCTURE_INVALID: true,
      EXPORT_PDF_RENDER_FAILED: true,
      EXPORT_PDF_INVALID: true,
      EXPORT_FILENAME_FAILED: true,
      EXPORT_UPLOAD_FAILED: true,
      EXPORT_FINALIZE_FAILED: true,
      EXPORT_OVERRIDE_NORMALIZATION_FAILED: true,
      EXPORT_IDEMPOTENCY_CONFLICT: true,
    };

    for (const code of Object.keys(allCodes) as ExportGenerationErrorCode[]) {
      it(`can construct error with code ${code}`, () => {
        const err = new ExportDocumentGenerationError({
          code,
          message: `Test: ${code}`,
        });
        expect(err.code).toBe(code);
        expect(err.name).toBe('ExportDocumentGenerationError');
        expect(err.message).toContain(code);
        expect(err).toBeInstanceOf(Error);
      });
    }
  });

  it('preserves error details', () => {
    const details = { stage: 'renderHTML', input: 'test' };
    const err = new ExportDocumentGenerationError({
      code: 'EXPORT_RENDER_TOO_SHORT',
      message: 'HTML too short',
      details,
    });
    expect(err.details).toBe(details);
  });
});
