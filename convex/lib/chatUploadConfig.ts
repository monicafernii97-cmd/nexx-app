import { CHAT_UPLOAD_CONFIG } from '../../src/lib/chat/uploadShared';

export { CHAT_UPLOAD_CONFIG };

export type ChatUploadIntent = 'attachment' | 'court_order';

export type ChatUploadStatus =
  | 'awaiting_storage_upload'
  | 'uploading_to_storage'
  | 'stored'
  | 'processing_queued'
  | 'processing'
  | 'ready'
  | 'partial'
  | 'failed_storage_upload'
  | 'failed_processing'
  | 'failed_empty_extraction'
  | 'stalled'
  | 'cancelled';

export function getChatUploadExtension(filename: string) {
  const trimmed = filename.trim().toLowerCase();
  const dotIndex = trimmed.lastIndexOf('.');
  return dotIndex >= 0 ? trimmed.slice(dotIndex + 1) : '';
}

export function validateChatUploadMetadata(args: {
  filename: string;
  mimeType: string;
  byteSize: number;
}) {
  const filename = args.filename.trim();
  const extension = getChatUploadExtension(filename);
  const allowedMime = CHAT_UPLOAD_CONFIG.allowedMimeTypes.includes(
    args.mimeType as (typeof CHAT_UPLOAD_CONFIG.allowedMimeTypes)[number],
  );
  const allowedExtension = CHAT_UPLOAD_CONFIG.allowedExtensions.includes(
    extension as (typeof CHAT_UPLOAD_CONFIG.allowedExtensions)[number],
  );

  if (!filename) return { ok: false as const, error: 'File name is required.', extension };
  if (filename.length > 240) return { ok: false as const, error: 'File name is too long.', extension };
  if (args.byteSize <= 0) return { ok: false as const, error: 'File is empty.', extension };
  if (!allowedMime || !allowedExtension) {
    return { ok: false as const, error: 'Unsupported file type. Upload PDF, DOCX, or TXT.', extension };
  }
  if (args.byteSize > CHAT_UPLOAD_CONFIG.maxBytes) {
    return { ok: false as const, error: 'File too large. Maximum size is 25MB.', extension };
  }
  return { ok: true as const, extension };
}
