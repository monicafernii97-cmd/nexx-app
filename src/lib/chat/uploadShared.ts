export const CHAT_UPLOAD_CONFIG = {
  maxBytes: 25 * 1024 * 1024,
  allowedMimeTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ],
  allowedExtensions: ['pdf', 'docx', 'txt'],
  legacyDocMimeTypes: ['application/msword'],
  legacyDocExtensions: ['doc'],
  maxDirectChatContextChars: 60_000,
  maxUploadResponsePreviewChars: 4_000,
  uploadSessionTtlMs: 60 * 60 * 1000,
  processingStaleAfterMs: 45 * 60 * 1000,
  maxProcessingAttempts: 3,
  maxStorageAttempts: 4,
  uploadUrlTtlMs: 60 * 60 * 1000,
  fallbackUploadMaxBytes: 19 * 1024 * 1024,
  fallbackTicketTtlMs: 5 * 60 * 1000,
  storageRetryDelayMs: 1_500,
  progressDiagnosticMinIntervalMs: 1_000,
  progressDiagnosticMinPercentDelta: 10,
  failureAlertWindowMs: 15 * 60 * 1000,
  failureAlertThreshold: 3,
  workerTimeoutMs: 70_000,
  maxAttachmentsPerTurn: 5,
} as const;

export function shouldPersistUploadProgressDiagnostic(args: {
  now: number;
  lastRecordedAt: number;
  percent: number;
  lastRecordedPercent: number;
}) {
  const enoughTime = args.now - args.lastRecordedAt >= CHAT_UPLOAD_CONFIG.progressDiagnosticMinIntervalMs;
  const enoughProgress = args.percent - args.lastRecordedPercent >= CHAT_UPLOAD_CONFIG.progressDiagnosticMinPercentDelta;
  return enoughTime || enoughProgress;
}
