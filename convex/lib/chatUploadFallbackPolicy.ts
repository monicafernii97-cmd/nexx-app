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
  retryDelayMs: number;
}) {
  const exhausted = args.attemptNo >= args.maxAttempts;
  return {
    exhausted,
    retryable: !exhausted,
    nextStorageRetryAt: exhausted ? undefined : args.now + args.retryDelayMs,
  };
}
