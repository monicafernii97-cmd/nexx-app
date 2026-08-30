export function isValidFallbackTokenHash(value: string) {
  return /^[a-f0-9]{64}$/.test(value.trim().toLowerCase());
}

export function getStorageAttachmentDisposition(
  existingStorageId: string | undefined,
  requestedStorageId: string,
) {
  if (!existingStorageId) return 'attach' as const;
  return existingStorageId === requestedStorageId
    ? 'already_attached' as const
    : 'conflict' as const;
}

export function validateFallbackPayload(args: {
  actualByteSize: number;
  actualMimeType: string;
  expectedByteSize: number;
  expectedMimeType: string;
  maxByteSize: number;
}) {
  if (args.actualByteSize !== args.expectedByteSize || args.actualByteSize > args.maxByteSize) {
    return { ok: false as const, failureCode: 'fallback_size_mismatch' as const };
  }
  if (
    args.expectedMimeType &&
    args.expectedMimeType !== 'application/octet-stream' &&
    args.actualMimeType !== args.expectedMimeType
  ) {
    return { ok: false as const, failureCode: 'fallback_content_type_mismatch' as const };
  }
  return { ok: true as const };
}

export function getStorageAttemptPolicy(args: {
  attemptNo: number;
  maxAttempts: number;
  now: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
}) {
  const exhausted = args.attemptNo >= args.maxAttempts;
  const retryDelayMs = Math.min(
    args.retryMaxDelayMs,
    args.retryBaseDelayMs * (2 ** Math.max(0, args.attemptNo - 1)),
  );
  return {
    exhausted,
    retryable: !exhausted,
    retryDelayMs,
    nextStorageRetryAt: exhausted ? undefined : args.now + retryDelayMs,
  };
}

export function expectedChunkCount(byteSize: number, chunkBytes: number) {
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) throw new Error('byteSize must be positive');
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) throw new Error('chunkBytes must be positive');
  return Math.ceil(byteSize / chunkBytes);
}

export function expectedChunkByteSize(args: {
  fileByteSize: number;
  chunkBytes: number;
  chunkIndex: number;
}) {
  const chunkCount = expectedChunkCount(args.fileByteSize, args.chunkBytes);
  if (!Number.isSafeInteger(args.chunkIndex) || args.chunkIndex < 0 || args.chunkIndex >= chunkCount) {
    throw new Error('Chunk index is out of range');
  }
  const start = args.chunkIndex * args.chunkBytes;
  return Math.min(args.chunkBytes, args.fileByteSize - start);
}

export function validateResumableChunk(args: {
  fileByteSize: number;
  chunkBytes: number;
  chunkIndex: number;
  actualByteSize: number;
  expectedSha256?: string;
  actualSha256: string;
}) {
  let expectedByteSize: number;
  try {
    expectedByteSize = expectedChunkByteSize(args);
  } catch {
    return { ok: false as const, failureCode: 'chunk_index_invalid' as const };
  }
  if (args.actualByteSize !== expectedByteSize) {
    return { ok: false as const, failureCode: 'chunk_size_mismatch' as const };
  }
  if (args.expectedSha256 && args.actualSha256 !== args.expectedSha256) {
    return { ok: false as const, failureCode: 'chunk_integrity_mismatch' as const };
  }
  return { ok: true as const, expectedByteSize };
}
