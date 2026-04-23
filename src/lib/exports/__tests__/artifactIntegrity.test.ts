/**
 * Artifact Integrity — Unit Tests
 *
 * Validates checksum computation and post-upload verification
 * for the artifact integrity system.
 */

import { describe, it, expect } from 'vitest';
import { computeArtifactChecksum, verifyUploadedArtifact } from '../artifactIntegrity';

describe('computeArtifactChecksum', () => {
  it('produces a 64-character hex SHA-256 string', () => {
    const buffer = Buffer.from('%PDF-1.4 test content');
    const checksum = computeArtifactChecksum(buffer);
    expect(checksum).toHaveLength(64);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic — same buffer produces same checksum', () => {
    const buffer = Buffer.from('identical content');
    expect(computeArtifactChecksum(buffer)).toBe(computeArtifactChecksum(buffer));
  });

  it('produces different checksums for different buffers', () => {
    const buf1 = Buffer.from('%PDF-1.4 content A');
    const buf2 = Buffer.from('%PDF-1.4 content B');
    expect(computeArtifactChecksum(buf1)).not.toBe(computeArtifactChecksum(buf2));
  });

  it('handles empty buffer', () => {
    const checksum = computeArtifactChecksum(Buffer.alloc(0));
    expect(checksum).toHaveLength(64);
  });

  it('handles large buffers', () => {
    const largeBuf = Buffer.alloc(10 * 1024 * 1024, 'a'); // 10MB
    const checksum = computeArtifactChecksum(largeBuf);
    expect(checksum).toHaveLength(64);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('verifyUploadedArtifact', () => {
  it('passes when all checks match', () => {
    const result = verifyUploadedArtifact({
      storageId: 'storage_abc123',
      reportedByteLength: 50000,
      expectedByteLength: 50000,
      checksum: 'abc123',
    });
    expect(result.verified).toBe(true);
    expect(result.byteLengthMatch).toBe(true);
    expect(result.storageIdValid).toBe(true);
    expect(result.checksum).toBe('abc123');
  });

  it('fails when byte length mismatches', () => {
    const result = verifyUploadedArtifact({
      storageId: 'storage_abc123',
      reportedByteLength: 49999,
      expectedByteLength: 50000,
      checksum: 'abc123',
    });
    expect(result.verified).toBe(false);
    expect(result.byteLengthMatch).toBe(false);
    expect(result.storageIdValid).toBe(true);
  });

  it('fails when storageId is undefined', () => {
    const result = verifyUploadedArtifact({
      storageId: undefined,
      reportedByteLength: 50000,
      expectedByteLength: 50000,
      checksum: 'abc123',
    });
    expect(result.verified).toBe(false);
    expect(result.storageIdValid).toBe(false);
    expect(result.byteLengthMatch).toBe(true);
  });

  it('fails when storageId is null', () => {
    const result = verifyUploadedArtifact({
      storageId: null,
      reportedByteLength: 50000,
      expectedByteLength: 50000,
      checksum: 'abc123',
    });
    expect(result.verified).toBe(false);
    expect(result.storageIdValid).toBe(false);
  });

  it('fails when storageId is empty string', () => {
    const result = verifyUploadedArtifact({
      storageId: '',
      reportedByteLength: 50000,
      expectedByteLength: 50000,
      checksum: 'abc123',
    });
    expect(result.verified).toBe(false);
    expect(result.storageIdValid).toBe(false);
  });

  it('fails when both checks fail', () => {
    const result = verifyUploadedArtifact({
      storageId: null,
      reportedByteLength: 0,
      expectedByteLength: 50000,
      checksum: 'abc123',
    });
    expect(result.verified).toBe(false);
    expect(result.byteLengthMatch).toBe(false);
    expect(result.storageIdValid).toBe(false);
  });

  it('preserves checksum in result', () => {
    const checksum = 'a'.repeat(64);
    const result = verifyUploadedArtifact({
      storageId: 'valid',
      reportedByteLength: 100,
      expectedByteLength: 100,
      checksum,
    });
    expect(result.checksum).toBe(checksum);
  });
});
