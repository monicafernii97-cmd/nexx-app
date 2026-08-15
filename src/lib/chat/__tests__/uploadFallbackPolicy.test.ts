import { describe, expect, it } from 'vitest';
import {
  getStorageAttachmentDisposition,
  getStorageAttemptPolicy,
  isValidFallbackTokenHash,
  validateFallbackPayload,
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
      attemptNo: 3,
      maxAttempts: 4,
      now: 1_000,
      retryDelayMs: 1_500,
    })).toEqual({ exhausted: false, retryable: true, nextStorageRetryAt: 2_500 });
    expect(getStorageAttemptPolicy({
      attemptNo: 4,
      maxAttempts: 4,
      now: 1_000,
      retryDelayMs: 1_500,
    })).toEqual({ exhausted: true, retryable: false, nextStorageRetryAt: undefined });
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
