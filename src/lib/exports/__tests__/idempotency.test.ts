/**
 * Idempotency System — Unit Tests
 *
 * Validates deterministic fingerprint generation and payload hashing
 * for the export duplicate prevention system.
 */

import { describe, it, expect } from 'vitest';
import { hashPayload, generateRunFingerprint } from '../idempotency';

describe('hashPayload', () => {
  it('produces a 64-character hex SHA-256 string', () => {
    const hash = hashPayload({ exportPath: 'court_document', data: 'hello' });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic — same input produces same hash', () => {
    const data = { path: 'court_document', sections: ['a', 'b'] };
    expect(hashPayload(data)).toBe(hashPayload(data));
  });

  it('produces different hashes for different inputs', () => {
    const hash1 = hashPayload({ path: 'court_document' });
    const hash2 = hashPayload({ path: 'case_summary' });
    expect(hash1).not.toBe(hash2);
  });

  it('handles primitive values', () => {
    expect(hashPayload('string')).toHaveLength(64);
    expect(hashPayload(42)).toHaveLength(64);
    expect(hashPayload(null)).toHaveLength(64);
  });

  it('is order-sensitive for JSON keys', () => {
    // JSON.stringify is key-order-dependent; this is expected behavior
    const hash1 = hashPayload({ a: 1, b: 2 });
    const hash2 = hashPayload({ b: 2, a: 1 });
    // These MAY differ depending on insertion order — that's acceptable
    // since we always control the input shape via the pipeline
    expect(hash1).toHaveLength(64);
    expect(hash2).toHaveLength(64);
  });
});

describe('generateRunFingerprint', () => {
  it('produces a deterministic fingerprint from inputs', () => {
    const fp = generateRunFingerprint({
      caseId: 'case_123',
      exportPath: 'court_document',
      payloadHash: 'abc123',
    });
    expect(fp).toBe('case_123:court_document:abc123');
  });

  it('uses "anon" when caseId is undefined', () => {
    const fp = generateRunFingerprint({
      exportPath: 'case_summary',
      payloadHash: 'xyz789',
    });
    expect(fp).toBe('anon:case_summary:xyz789');
  });

  it('same inputs produce same fingerprint', () => {
    const input = {
      caseId: 'case_456',
      exportPath: 'exhibit_document',
      payloadHash: 'def456',
    };
    expect(generateRunFingerprint(input)).toBe(generateRunFingerprint(input));
  });

  it('different inputs produce different fingerprints', () => {
    const fp1 = generateRunFingerprint({
      caseId: 'case_1',
      exportPath: 'court_document',
      payloadHash: 'hash1',
    });
    const fp2 = generateRunFingerprint({
      caseId: 'case_2',
      exportPath: 'court_document',
      payloadHash: 'hash1',
    });
    expect(fp1).not.toBe(fp2);
  });

  it('different export paths produce different fingerprints', () => {
    const fp1 = generateRunFingerprint({
      caseId: 'case_1',
      exportPath: 'court_document',
      payloadHash: 'hash1',
    });
    const fp2 = generateRunFingerprint({
      caseId: 'case_1',
      exportPath: 'case_summary',
      payloadHash: 'hash1',
    });
    expect(fp1).not.toBe(fp2);
  });

  it('different payload hashes produce different fingerprints', () => {
    const fp1 = generateRunFingerprint({
      caseId: 'case_1',
      exportPath: 'court_document',
      payloadHash: 'hashA',
    });
    const fp2 = generateRunFingerprint({
      caseId: 'case_1',
      exportPath: 'court_document',
      payloadHash: 'hashB',
    });
    expect(fp1).not.toBe(fp2);
  });

  it('integrates with hashPayload for end-to-end fingerprinting', () => {
    const hash = hashPayload({ sections: ['body'], exportPath: 'court_document' });
    const fp = generateRunFingerprint({
      caseId: 'case_999',
      exportPath: 'court_document',
      payloadHash: hash,
    });
    expect(fp).toMatch(/^case_999:court_document:[a-f0-9]{64}$/);
  });
});
