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

  it('accepts valid PDF buffer', () => {
    // Construct a minimal valid PDF-like buffer
    const header = Buffer.from('%PDF-1.4 ');
    const body = Buffer.alloc(2048, 'A');
    const validBuf = Buffer.concat([header, body]);

    const result = validatePdfBuffer(validBuf);
    expect(result.byteLength).toBe(validBuf.length);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
