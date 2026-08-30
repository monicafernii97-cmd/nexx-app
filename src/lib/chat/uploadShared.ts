export const CHAT_UPLOAD_CONFIG = {
  maxBytes: 25 * 1024 * 1024,
  allowedMimeTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.oasis.opendocument.text',
    'text/plain',
    'text/csv',
    'text/html',
    'text/rtf',
    'application/rtf',
    'message/rfc822',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/tiff',
  ],
  allowedExtensions: ['pdf', 'docx', 'txt', 'pptx', 'xlsx', 'odt', 'csv', 'html', 'htm', 'rtf', 'eml', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'tif', 'tiff'],
  legacyDocMimeTypes: ['application/msword'],
  legacyDocExtensions: ['doc'],
  maxDirectChatContextChars: 60_000,
  maxUploadResponsePreviewChars: 4_000,
  uploadSessionTtlMs: 60 * 60 * 1000,
  processingStaleAfterMs: 45 * 60 * 1000,
  maxProcessingAttempts: 3,
  maxStorageAttempts: 3,
  uploadUrlTtlMs: 60 * 60 * 1000,
  fallbackUploadMaxBytes: 19 * 1024 * 1024,
  fallbackTicketTtlMs: 5 * 60 * 1000,
  resumableChunkBytes: 4 * 1024 * 1024,
  resumableUploadTtlMs: 10 * 60 * 1000,
  resumableRetentionMs: 24 * 60 * 60 * 1000,
  resumableAssemblyLeaseMs: 2 * 60 * 1000,
  maxChunkAttempts: 3,
  storageRetryBaseDelayMs: 1_000,
  storageRetryMaxDelayMs: 8_000,
  directReconciliationWindowMs: 10 * 60 * 1000,
  directOrphanGraceMs: 30 * 60 * 1000,
  progressDiagnosticMinIntervalMs: 1_000,
  progressDiagnosticMinPercentDelta: 10,
  failureAlertWindowMs: 15 * 60 * 1000,
  failureAlertThreshold: 3,
  canaryIntervalMs: 10 * 60 * 1000,
  canaryStaleAfterMs: 25 * 60 * 1000,
  canaryRetentionMs: 30 * 24 * 60 * 60 * 1000,
  canaryPayloadBytes: 1_024,
  workerTimeoutMs: 70_000,
  maxAttachmentsPerTurn: 5,
} as const;

export const CHAT_UPLOAD_MIME_BY_EXTENSION: Record<string, readonly string[]> = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  odt: ['application/vnd.oasis.opendocument.text'],
  txt: ['text/plain'], csv: ['text/csv', 'text/plain'], html: ['text/html'], htm: ['text/html'],
  rtf: ['application/rtf', 'text/rtf'], eml: ['message/rfc822', 'text/plain'],
  png: ['image/png'], jpg: ['image/jpeg'], jpeg: ['image/jpeg'], webp: ['image/webp'],
  gif: ['image/gif'], tif: ['image/tiff'], tiff: ['image/tiff'],
};

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
