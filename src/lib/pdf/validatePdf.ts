/**
 * PDF Buffer Validation
 *
 * Hard validation gates applied before persisting a generated PDF.
 * Catches empty buffers, truncated renders, and non-PDF output.
 */

import crypto from 'node:crypto';

export type ValidatedPdf = {
  byteLength: number;
  sha256: string;
};

/** Minimum viable PDF size — anything smaller is almost certainly corrupt. */
const MIN_PDF_BYTES = 1024;

/**
 * Validate a PDF buffer for integrity before storage.
 *
 * Checks:
 * - Non-empty
 * - Above minimum size threshold
 * - Starts with %PDF- magic header
 * - Computes SHA-256 hash for deduplication and audit
 *
 * @throws if any validation gate fails
 */
export function validatePdfBuffer(pdfBuffer: Buffer): ValidatedPdf {
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new Error('PDF generation returned an empty buffer.');
  }

  if (pdfBuffer.length < MIN_PDF_BYTES) {
    throw new Error(
      `PDF buffer too small (${pdfBuffer.length} bytes). Minimum: ${MIN_PDF_BYTES}.`,
    );
  }

  const header = pdfBuffer.subarray(0, 5).toString('utf8');
  if (header !== '%PDF-') {
    throw new Error(`Invalid PDF header: ${JSON.stringify(header)}`);
  }

  const sha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

  return {
    byteLength: pdfBuffer.length,
    sha256,
  };
}
