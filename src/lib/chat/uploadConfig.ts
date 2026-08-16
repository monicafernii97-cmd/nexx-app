import { CHAT_UPLOAD_CONFIG, CHAT_UPLOAD_MIME_BY_EXTENSION } from './uploadShared';
import type { DocumentAnalysisMode } from './documentAnalysisMode';

export { CHAT_UPLOAD_CONFIG };

export type ChatUploadIntent = 'attachment' | 'court_order';

export type ChatComposerFileStatus =
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
  | 'quarantined'
  | 'stalled'
  | 'cancelled';

export type ChatAttachmentRef = {
  uploadedFileId: string;
  uploadSessionId: string;
  storageId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  status: 'ready' | 'partial';
  analysisMode?: DocumentAnalysisMode;
  extractionMethod?: string;
  pagesProcessed?: number;
  pagesTotal?: number;
  contextTruncated?: boolean;
  extractionWarnings?: string[];
  coverageStatus?: 'complete' | 'partial' | 'failed' | 'unverified';
  fullDocumentReviewStatus?: 'not_started' | 'building' | 'ready' | 'partial' | 'failed';
};

export function getChatUploadExtension(filename: string) {
  const trimmed = filename.trim().toLowerCase();
  const dotIndex = trimmed.lastIndexOf('.');
  return dotIndex >= 0 ? trimmed.slice(dotIndex + 1) : '';
}

export function isAllowedChatUploadType(file: Pick<File, 'name' | 'type'>) {
  const extension = getChatUploadExtension(file.name);
  const mimeType = file.type || 'application/octet-stream';
  const hasGenericMime = !file.type || mimeType === 'application/octet-stream';
  const isStandardType = Boolean(CHAT_UPLOAD_MIME_BY_EXTENSION[extension]?.includes(mimeType) ||
    (hasGenericMime && CHAT_UPLOAD_CONFIG.allowedExtensions.includes(extension as (typeof CHAT_UPLOAD_CONFIG.allowedExtensions)[number])));

  if (isStandardType) return true;

  if (isLegacyDocClientUploadEnabled()) {
    return (
      (CHAT_UPLOAD_CONFIG.legacyDocMimeTypes.includes(mimeType as (typeof CHAT_UPLOAD_CONFIG.legacyDocMimeTypes)[number]) || hasGenericMime) &&
      CHAT_UPLOAD_CONFIG.legacyDocExtensions.includes(extension as (typeof CHAT_UPLOAD_CONFIG.legacyDocExtensions)[number])
    );
  }

  return false;
}

export function isLegacyDocClientUploadEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_LEGACY_DOC_EXTRACTION === 'true';
}

export function getChatUploadAccept() {
  const extensions: string[] = [...CHAT_UPLOAD_CONFIG.allowedExtensions];
  if (isLegacyDocClientUploadEnabled()) extensions.splice(2, 0, 'doc');
  return extensions.map((extension) => `.${extension}`).join(',');
}

function looksLikeLegacyDoc(file: Pick<File, 'name' | 'type'>) {
  const extension = getChatUploadExtension(file.name);
  const mimeType = file.type || 'application/octet-stream';
  const hasGenericMime = !file.type || mimeType === 'application/octet-stream';
  return (
    (CHAT_UPLOAD_CONFIG.legacyDocMimeTypes.includes(mimeType as (typeof CHAT_UPLOAD_CONFIG.legacyDocMimeTypes)[number]) || hasGenericMime) &&
    CHAT_UPLOAD_CONFIG.legacyDocExtensions.includes(extension as (typeof CHAT_UPLOAD_CONFIG.legacyDocExtensions)[number])
  );
}

export function validateChatUploadFile(file: Pick<File, 'name' | 'type' | 'size'>) {
  if (!file.name.trim()) return 'File name is required.';
  if (file.name.length > 240) return 'File name is too long.';
  if (file.size <= 0) return 'File is empty.';
  if (looksLikeLegacyDoc(file) && !isLegacyDocClientUploadEnabled()) {
    return 'Legacy .doc support is being prepared. Please upload DOCX or PDF for now.';
  }
  if (!isAllowedChatUploadType(file)) return 'Unsupported file type. Upload a document, image, presentation, spreadsheet, email, or text file.';
  if (file.size > CHAT_UPLOAD_CONFIG.maxBytes) return 'File too large. Maximum size is 25MB.';
  return null;
}
