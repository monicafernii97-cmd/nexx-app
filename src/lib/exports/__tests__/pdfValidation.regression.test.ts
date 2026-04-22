/**
 * PDF Validation Regression Tests
 *
 * Verifies that validatePdfBuffer correctly rejects
 * empty, too-small, and non-PDF buffers.
 */

import { describe, expect, it } from 'vitest';
import { validatePdfBuffer } from '../../pdf/validatePdf';

describe('validatePdfBuffer', () => {
  it('rejects empty buffer', () => {
    expect(() => validatePdfBuffer(Buffer.alloc(0))).toThrow('empty buffer');
  });

  it('rejects null-like input', () => {
    expect(() => validatePdfBuffer(null as unknown as Buffer)).toThrow();
  });

  it('rejects too-small buffer', () => {
    const smallBuf = Buffer.from('%PDF-1.4 tiny');
    expect(() => validatePdfBuffer(smallBuf)).toThrow('too small');
  });

  it('rejects non-PDF header', () => {
    const fakeBuf = Buffer.alloc(2048, 'x');
    expect(() => validatePdfBuffer(fakeBuf)).toThrow('Invalid PDF header');
  });

  it('accepts structurally valid PDF buffer', () => {
    // Minimal structurally valid PDF — header, object, xref, trailer, %%EOF
    const minimalPdf = [
      '%PDF-1.4',
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
      '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj',
      'xref',
      '0 4',
      '0000000000 65535 f ',
      '0000000009 00000 n ',
      '0000000058 00000 n ',
      '0000000115 00000 n ',
      'trailer<</Size 4/Root 1 0 R>>',
      'startxref',
      '190',
      '%%EOF',
    ].join('\n');

    // Pad to exceed MIN_PDF_BYTES (1024)
    const pdfContent = minimalPdf + '\n' + ' '.repeat(Math.max(0, 1100 - minimalPdf.length));
    const validBuf = Buffer.from(pdfContent, 'utf8');

    const result = validatePdfBuffer(validBuf);
    expect(result.byteLength).toBe(validBuf.length);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
