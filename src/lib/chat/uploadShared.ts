export const CHAT_UPLOAD_CONFIG = {
  maxBytes: 25 * 1024 * 1024,
  allowedMimeTypes: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ],
  allowedExtensions: ['pdf', 'doc', 'docx', 'txt'],
  maxDirectChatContextChars: 60_000,
  maxUploadResponsePreviewChars: 4_000,
  uploadSessionTtlMs: 60 * 60 * 1000,
  processingStaleAfterMs: 12 * 60 * 1000,
  maxProcessingAttempts: 3,
  uploadUrlTtlMs: 60 * 60 * 1000,
} as const;
