import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { ConvexReactClient } from 'convex/react';
import {
  CHAT_UPLOAD_CONFIG,
  type ChatAttachmentRef,
  type ChatUploadIntent,
  type ChatComposerFileStatus,
  validateChatUploadFile,
} from './uploadConfig';

type ConvexClientLike = {
  mutation: ConvexReactClient['mutation'];
  query: ConvexReactClient['query'];
};

type UploadSessionSnapshot = {
  uploadSessionId?: string;
  uploadUrl?: string;
  uploadUrlExpiresAt?: number;
  storageId?: string;
  uploadedFileId?: string;
  status?: ChatComposerFileStatus | 'awaiting_storage_upload';
  filename?: string;
  mimeType?: string;
  byteSize?: number;
  processingAttempt?: number;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  extractionPreview?: string;
  extractionCharCount?: number;
  chatContextCharCount?: number;
  contextTruncated?: boolean;
  extractionMethod?: 'text' | 'ocr' | 'mixed';
  ocrAttempted?: boolean;
  pagesOcrProcessed?: number;
  pagesTotal?: number;
  indexingError?: string;
  extractionError?: string;
};

export type ChatComposerFileState = {
  file: File | null;
  intent: ChatUploadIntent;
  clientUploadKey: string;
  uploadSessionId?: string;
  uploadUrl?: string;
  uploadUrlExpiresAt?: number;
  storageId?: string;
  uploadedFileId?: string;
  status: ChatComposerFileStatus;
  progress?: number;
  processingAttempt?: number;
  error?: string;
  retryable: boolean;
  attachmentRef?: ChatAttachmentRef;
};

export type ChatUploadResponse = {
  ok: true;
  partial?: boolean;
  uploadSessionId: string;
  uploadedFileId: string;
  storageId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  status: 'ready' | 'partial';
  attachmentRef: ChatAttachmentRef;
  extractionPreview?: string;
  extractionCharCount?: number;
  chatContextCharCount?: number;
  contextTruncated?: boolean;
  extractionMethod?: 'text' | 'ocr' | 'mixed';
  ocrAttempted?: boolean;
  pagesOcrProcessed?: number;
  pagesTotal?: number;
  indexingError?: string;
  extractionError?: string;
  warnings?: string[];
};

export type UploadFileForConversationArgs = {
  convex: ConvexClientLike;
  file: File;
  conversationId?: Id<'conversations'> | string;
  caseId?: Id<'cases'> | string;
  intent: ChatUploadIntent;
  clientUploadKey: string;
  existingSession?: ChatComposerFileState | null;
  onProgress?: (progress: number) => void;
  onStatus?: (status: ChatComposerFileStatus) => void;
  onStorageReady?: (ids: { uploadSessionId: string; storageId: string }) => void;
};

function normalizeStatus(status: string): ChatComposerFileStatus {
  if (status === 'awaiting_storage_upload') return 'session_created';
  if (status === 'uploading_to_storage') return 'uploading_to_storage';
  if (status === 'stored') return 'stored';
  if (status === 'processing_queued') return 'processing_queued';
  if (status === 'processing') return 'processing';
  if (status === 'ready') return 'ready';
  if (status === 'partial') return 'partial';
  if (status === 'failed_storage_upload') return 'failed_storage_upload';
  if (status === 'failed_processing') return 'failed_processing';
  if (status === 'failed_empty_extraction') return 'failed_empty_extraction';
  if (status === 'stalled') return 'stalled';
  if (status === 'cancelled') return 'cancelled';
  return 'failed_processing';
}

function toUploadError(snapshot: UploadSessionSnapshot) {
  if (snapshot.errorMessage) return new Error(snapshot.errorMessage);
  switch (snapshot.status) {
    case 'failed_empty_extraction':
      return new Error('NEXX could not read any text from this file.');
    case 'failed_processing':
      return new Error('NEXX could not finish processing this file. Please retry.');
    case 'stalled':
      return new Error('File processing stalled. Please retry.');
    default:
      return new Error('Upload did not finish. Please retry.');
  }
}

function assertReadyUpload(snapshot: UploadSessionSnapshot): asserts snapshot is UploadSessionSnapshot & {
  uploadSessionId: string;
  uploadedFileId: string;
  storageId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  status: 'ready' | 'partial';
} {
  if (
    (snapshot.status !== 'ready' && snapshot.status !== 'partial') ||
    !snapshot.uploadSessionId ||
    !snapshot.uploadedFileId ||
    !snapshot.storageId ||
    !snapshot.filename ||
    !snapshot.mimeType ||
    typeof snapshot.byteSize !== 'number'
  ) {
    throw toUploadError(snapshot);
  }
}

function buildChatUploadResponse(snapshot: UploadSessionSnapshot): ChatUploadResponse {
  assertReadyUpload(snapshot);
  const attachmentRef: ChatAttachmentRef = {
    uploadedFileId: snapshot.uploadedFileId,
    uploadSessionId: snapshot.uploadSessionId,
    storageId: snapshot.storageId,
    filename: snapshot.filename,
    mimeType: snapshot.mimeType,
    byteSize: snapshot.byteSize,
    status: snapshot.status,
  };

  return {
    ok: true,
    partial: snapshot.status === 'partial',
    uploadSessionId: snapshot.uploadSessionId,
    uploadedFileId: snapshot.uploadedFileId,
    storageId: snapshot.storageId,
    filename: snapshot.filename,
    mimeType: snapshot.mimeType,
    byteSize: snapshot.byteSize,
    status: snapshot.status,
    attachmentRef,
    extractionPreview: snapshot.extractionPreview,
    extractionCharCount: snapshot.extractionCharCount,
    chatContextCharCount: snapshot.chatContextCharCount,
    contextTruncated: snapshot.contextTruncated,
    extractionMethod: snapshot.extractionMethod,
    ocrAttempted: snapshot.ocrAttempted,
    pagesOcrProcessed: snapshot.pagesOcrProcessed,
    pagesTotal: snapshot.pagesTotal,
    indexingError: snapshot.indexingError,
    extractionError: snapshot.extractionError,
    warnings: [
      snapshot.indexingError ? `File search indexing did not finish: ${snapshot.indexingError}` : undefined,
      snapshot.extractionError ? `Extraction note: ${snapshot.extractionError}` : undefined,
    ].filter(Boolean) as string[],
  };
}

function parseSessionSnapshot(value: unknown): UploadSessionSnapshot {
  if (!value || typeof value !== 'object') {
    throw new Error('Upload session returned invalid data.');
  }
  return value as UploadSessionSnapshot;
}

function uploadDirectlyToConvexStorage(args: {
  uploadUrl: string;
  file: File;
  onProgress?: (progress: number) => void;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.timeout = 120_000;
    xhr.open('POST', args.uploadUrl);
    xhr.setRequestHeader('Content-Type', args.file.type || 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        args.onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Storage upload failed with status ${xhr.status}`));
        return;
      }
      try {
        const json = JSON.parse(xhr.responseText) as { storageId?: string };
        if (!json.storageId) {
          reject(new Error('Storage upload completed but no storageId was returned.'));
          return;
        }
        resolve(json.storageId);
      } catch {
        reject(new Error('Storage upload returned invalid JSON.'));
      }
    };
    xhr.onerror = () => reject(new Error('Storage upload failed due to a network error.'));
    xhr.onabort = () => reject(new Error('Storage upload was cancelled.'));
    xhr.ontimeout = () => reject(new Error('Storage upload timed out.'));
    xhr.send(args.file);
  });
}

async function waitForUploadProcessing(args: {
  convex: ConvexClientLike;
  uploadSessionId: string;
  timeoutMs: number;
  onStatus?: (status: ChatComposerFileStatus) => void;
}) {
  const startedAt = Date.now();
  let lastStatus: string | undefined;

  while (Date.now() - startedAt < args.timeoutMs) {
    const snapshot = parseSessionSnapshot(await args.convex.query(api.chatUploads.getUploadSession, {
      uploadSessionId: args.uploadSessionId as Id<'chatUploadSessions'>,
    }));
    const normalized = normalizeStatus(String(snapshot.status));
    if (normalized !== lastStatus) {
      args.onStatus?.(normalized);
      lastStatus = normalized;
    }

    if (snapshot.status === 'ready' || snapshot.status === 'partial') return snapshot;
    if (
      snapshot.status === 'failed_storage_upload' ||
      snapshot.status === 'failed_processing' ||
      snapshot.status === 'failed_empty_extraction' ||
      snapshot.status === 'stalled'
    ) {
      throw toUploadError(snapshot);
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }

  throw new Error('File processing is taking longer than expected. Please retry in a moment.');
}

/** Upload a chat file directly to Convex storage and return a tiny attachment ref. */
export async function uploadFileForConversation(args: UploadFileForConversationArgs): Promise<ChatUploadResponse> {
  const validationError = validateChatUploadFile(args.file);
  if (validationError) throw new Error(validationError);
  if (!args.clientUploadKey.trim()) throw new Error('Upload retry key is missing.');

  args.onStatus?.('session_created');
  const existing = args.existingSession;
  const session = existing?.uploadSessionId
    ? parseSessionSnapshot(await args.convex.query(api.chatUploads.getUploadSession, {
      uploadSessionId: existing.uploadSessionId as Id<'chatUploadSessions'>,
    }))
    : parseSessionSnapshot(await args.convex.mutation(api.chatUploads.startUploadSession, {
      conversationId: args.conversationId as Id<'conversations'> | undefined,
      caseId: args.caseId as Id<'cases'> | undefined,
      clientUploadKey: args.clientUploadKey,
      filename: args.file.name,
      mimeType: args.file.type || 'application/octet-stream',
      byteSize: args.file.size,
      intent: args.intent,
    }));

  const uploadSessionId = session.uploadSessionId;
  if (!uploadSessionId) throw new Error('Upload session was not created.');
  let storageId = session.storageId ?? existing?.storageId;

  if (!storageId) {
    const uploadUrl = session.uploadUrl ?? existing?.uploadUrl;
    if (!uploadUrl) throw new Error('Upload URL was not created.');
    args.onStatus?.('uploading_to_storage');
    try {
      storageId = await uploadDirectlyToConvexStorage({
        uploadUrl,
        file: args.file,
        onProgress: args.onProgress,
      });
      args.onStorageReady?.({ uploadSessionId, storageId });
      args.onProgress?.(100);
    } catch (error) {
      args.onStatus?.('failed_storage_upload');
      throw error;
    }

    args.onStatus?.('stored');
    await args.convex.mutation(api.chatUploads.attachStorageAndScheduleProcessing, {
      uploadSessionId: uploadSessionId as Id<'chatUploadSessions'>,
      storageId: storageId as Id<'_storage'>,
    });
  } else if (!session.uploadedFileId) {
    args.onStatus?.('processing_queued');
    await args.convex.mutation(api.chatUploads.retryProcessing, {
      uploadSessionId: uploadSessionId as Id<'chatUploadSessions'>,
    });
  }

  const ready = await waitForUploadProcessing({
    convex: args.convex,
    uploadSessionId,
    timeoutMs: CHAT_UPLOAD_CONFIG.processingStaleAfterMs,
    onStatus: args.onStatus,
  });

  return buildChatUploadResponse({
    ...ready,
    uploadSessionId,
    storageId,
  });
}
