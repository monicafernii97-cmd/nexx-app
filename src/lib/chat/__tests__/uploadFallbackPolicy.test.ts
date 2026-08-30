import { describe, expect, it } from 'vitest';
import {
  getStorageAttachmentDisposition,
  getStorageAttemptPolicy,
  expectedChunkByteSize,
  expectedChunkCount,
  isValidFallbackTokenHash,
  validateFallbackPayload,
  validateResumableChunk,
} from '@convex/lib/chatUploadFallbackPolicy';
import { hasCompleteDocumentRetrieval } from '@convex/lib/chatUploadReadiness';
import { shouldPersistUploadProgressDiagnostic } from '../uploadShared';

describe('chat upload fallback policy', () => {
  it('accepts only SHA-256 token hashes', () => {
    expect(isValidFallbackTokenHash('a'.repeat(64))).toBe(true);
    expect(isValidFallbackTokenHash('A'.repeat(64))).toBe(true);
    expect(isValidFallbackTokenHash('a'.repeat(63))).toBe(false);
    expect(isValidFallbackTokenHash('z'.repeat(64))).toBe(false);
  });

  it('requires the exact ticket size and enforces the fallback cap', () => {
    expect(validateFallbackPayload({
      actualByteSize: 100,
      actualMimeType: 'application/pdf',
      expectedByteSize: 100,
      expectedMimeType: 'application/pdf',
      maxByteSize: 200,
    })).toEqual({ ok: true });
    expect(validateFallbackPayload({
      actualByteSize: 99,
      actualMimeType: 'application/pdf',
      expectedByteSize: 100,
      expectedMimeType: 'application/pdf',
      maxByteSize: 200,
    })).toEqual({ ok: false, failureCode: 'fallback_size_mismatch' });
    expect(validateFallbackPayload({
      actualByteSize: 201,
      actualMimeType: 'application/pdf',
      expectedByteSize: 201,
      expectedMimeType: 'application/pdf',
      maxByteSize: 200,
    })).toEqual({ ok: false, failureCode: 'fallback_size_mismatch' });
  });

  it('validates a specific MIME type but permits a generic ticket MIME', () => {
    expect(validateFallbackPayload({
      actualByteSize: 100,
      actualMimeType: 'text/plain',
      expectedByteSize: 100,
      expectedMimeType: 'application/pdf',
      maxByteSize: 200,
    })).toEqual({ ok: false, failureCode: 'fallback_content_type_mismatch' });
    expect(validateFallbackPayload({
      actualByteSize: 100,
      actualMimeType: 'application/pdf',
      expectedByteSize: 100,
      expectedMimeType: 'application/octet-stream',
      maxByteSize: 200,
    })).toEqual({ ok: true });
  });

  it('makes same-storage attachment idempotent and rejects a different stored object', () => {
    expect(getStorageAttachmentDisposition(undefined, 'storage-1')).toBe('attach');
    expect(getStorageAttachmentDisposition('storage-1', 'storage-1')).toBe('already_attached');
    expect(getStorageAttachmentDisposition('storage-1', 'storage-2')).toBe('conflict');
  });

  it('stops retrying after the configured storage-attempt limit', () => {
    expect(getStorageAttemptPolicy({
      attemptNo: 1,
      maxAttempts: 3,
      now: 1_000,
      retryBaseDelayMs: 1_000,
      retryMaxDelayMs: 8_000,
    })).toEqual({ exhausted: false, retryable: true, retryDelayMs: 1_000, nextStorageRetryAt: 2_000 });
    expect(getStorageAttemptPolicy({
      attemptNo: 2,
      maxAttempts: 3,
      now: 1_000,
      retryBaseDelayMs: 1_000,
      retryMaxDelayMs: 8_000,
    })).toEqual({ exhausted: false, retryable: true, retryDelayMs: 2_000, nextStorageRetryAt: 3_000 });
    expect(getStorageAttemptPolicy({
      attemptNo: 3,
      maxAttempts: 3,
      now: 1_000,
      retryBaseDelayMs: 1_000,
      retryMaxDelayMs: 8_000,
    })).toEqual({ exhausted: true, retryable: false, retryDelayMs: 4_000, nextStorageRetryAt: undefined });
  });

  it('calculates and validates every chunk including the final remainder', () => {
    expect(expectedChunkCount(25, 8)).toBe(4);
    expect(expectedChunkByteSize({ fileByteSize: 25, chunkBytes: 8, chunkIndex: 3 })).toBe(1);
    expect(validateResumableChunk({
      fileByteSize: 25,
      chunkBytes: 8,
      chunkIndex: 3,
      actualByteSize: 1,
      expectedSha256: 'a'.repeat(64),
      actualSha256: 'a'.repeat(64),
    })).toEqual({ ok: true, expectedByteSize: 1 });
    expect(validateResumableChunk({
      fileByteSize: 25,
      chunkBytes: 8,
      chunkIndex: 3,
      actualByteSize: 2,
      actualSha256: 'a'.repeat(64),
    })).toEqual({ ok: false, failureCode: 'chunk_size_mismatch' });
  });

  it('covers the production boundary sizes through the full 25 MiB limit', () => {
    const MiB = 1024 * 1024;
    expect(expectedChunkCount(1, 4 * MiB)).toBe(1);
    expect(expectedChunkCount(4 * MiB, 4 * MiB)).toBe(1);
    expect(expectedChunkCount(19 * MiB, 4 * MiB)).toBe(5);
    expect(expectedChunkByteSize({ fileByteSize: 19 * MiB, chunkBytes: 4 * MiB, chunkIndex: 4 })).toBe(3 * MiB);
    expect(expectedChunkCount(25 * MiB, 4 * MiB)).toBe(7);
    expect(expectedChunkByteSize({ fileByteSize: 25 * MiB, chunkBytes: 4 * MiB, chunkIndex: 6 })).toBe(1 * MiB);
  });

  it('throttles progress writes unless time or percentage advances enough', () => {
    expect(shouldPersistUploadProgressDiagnostic({
      now: 1_500,
      lastRecordedAt: 1_000,
      percent: 15,
      lastRecordedPercent: 10,
    })).toBe(false);
    expect(shouldPersistUploadProgressDiagnostic({
      now: 2_000,
      lastRecordedAt: 1_000,
      percent: 15,
      lastRecordedPercent: 10,
    })).toBe(true);
    expect(shouldPersistUploadProgressDiagnostic({
      now: 1_500,
      lastRecordedAt: 1_000,
      percent: 20,
      lastRecordedPercent: 10,
    })).toBe(true);
  });

  it('requires a complete vector or document-memory path for truncated documents', () => {
    expect(hasCompleteDocumentRetrieval({})).toBe(false);
    expect(hasCompleteDocumentRetrieval({ openaiFileId: 'file-1' })).toBe(true);
    expect(hasCompleteDocumentRetrieval({ openaiTextFileId: 'file-2' })).toBe(true);
    expect(hasCompleteDocumentRetrieval({ activeMemoryGenerationId: 'memory-1' })).toBe(true);
  });
});
