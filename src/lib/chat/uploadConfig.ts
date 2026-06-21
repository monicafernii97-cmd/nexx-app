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

export type ChatUploadIntent = 'attachment' | 'court_order';

export type ChatUploadStatus =
  | 'idle'
  | 'selected'
  | 'session_created'
  | 'uploading_to_storage'
  | 'stored'
  | 'processing_queued'
  | 'processing'
  | 'ready'
  | 'partial'
  | 'failed_storage_upload'
  | 'failed_processing'
  | 'failed_empty_extraction'
  | 'stalled';

export type ChatAttachmentRef = {
  uploadedFileId: string;
  uploadSessionId: string;
  storageId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  status: 'ready' | 'partial';
};

export function getChatUploadExtension(filename: string) {
  const trimmed = filename.trim().toLowerCase();
  const dotIndex = trimmed.lastIndexOf('.');
  return dotIndex >= 0 ? trimmed.slice(dotIndex + 1) : '';
}

export function isAllowedChatUploadType(file: Pick<File, 'name' | 'type'>) {
  const extension = getChatUploadExtension(file.name);
  return (
    CHAT_UPLOAD_CONFIG.allowedMimeTypes.includes(file.type as (typeof CHAT_UPLOAD_CONFIG.allowedMimeTypes)[number]) ||
    CHAT_UPLOAD_CONFIG.allowedExtensions.includes(extension as (typeof CHAT_UPLOAD_CONFIG.allowedExtensions)[number])
  );
}

export function validateChatUploadFile(file: Pick<File, 'name' | 'type' | 'size'>) {
  if (!file.name.trim()) return 'File name is required.';
  if (file.name.length > 240) return 'File name is too long.';
  if (file.size <= 0) return 'File is empty.';
  if (!isAllowedChatUploadType(file)) return 'Unsupported file type. Upload PDF, DOC, DOCX, or TXT.';
  if (file.size > CHAT_UPLOAD_CONFIG.maxBytes) return 'File too large. Maximum size is 25MB.';
  return null;
}
