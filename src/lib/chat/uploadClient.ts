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
import {
  postFileToStorageWithDiagnostics,
  type StorageUploadDiagnosticEvent,
} from './uploadErrors';

type ConvexClientLike = {
  mutation: ConvexReactClient['mutation'];
  query: ConvexReactClient['query'];
};

type UploadSessionSnapshot = {
  uploadSessionId?: string;
  uploadAttemptId?: string;
  attemptId?: string;
  attemptNo?: number;
  uploadUrl?: string;
  uploadUrlExpiresAt?: number;
  storageId?: string;
  uploadedFileId?: string;
  existingStorageId?: string;
  existingUploadedFileId?: string;
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
  extractionMethod?: string;
  detectedType?: string;
  extractionWarnings?: string[];
  ocrAttempted?: boolean;
  pagesOcrProcessed?: number;
  pagesTotal?: number;
  indexingError?: string;
  extractionError?: string;
};

export class ChatUploadError extends Error {
  uploadStatus?: ChatComposerFileStatus;
  retryable?: boolean;
  errorCode?: string;

  constructor(message: string, options: {
    uploadStatus?: ChatComposerFileStatus;
    retryable?: boolean;
    errorCode?: string;
  } = {}) {
    super(message);
    this.name = 'ChatUploadError';
    this.uploadStatus = options.uploadStatus;
    this.retryable = options.retryable;
    this.errorCode = options.errorCode;
  }
}

export type ChatComposerFileState = {
  file: File | null;
  intent: ChatUploadIntent;
  clientUploadKey: string;
  clientTurnId: string;
  uploadSessionId?: string;
  uploadAttemptId?: string;
  attemptNo?: number;
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
  uploadAttemptId?: string;
  attemptNo?: number;
  attachmentRef: ChatAttachmentRef;
  extractionPreview?: string;
  extractionCharCount?: number;
  chatContextCharCount?: number;
  contextTruncated?: boolean;
  extractionMethod?: string;
  detectedType?: string;
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

const PENDING_ATTACH_PREFIX = 'pending-chat-upload:';

function normalizeStatus(status: string): ChatComposerFileStatus {
  if (status === 'awaiting_storage_upload') return 'session_created';
  if (status === 'session_created') return 'session_created';
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
  const uploadStatus = typeof snapshot.status === 'string' ? normalizeStatus(snapshot.status) : undefined;
  const retryable = snapshot.retryable ?? (
    uploadStatus !== 'failed_empty_extraction' &&
    uploadStatus !== 'cancelled'
  );
  const errorOptions = {
    uploadStatus,
    retryable,
    errorCode: snapshot.errorCode,
  };

  if (snapshot.errorMessage) return new ChatUploadError(snapshot.errorMessage, errorOptions);
  switch (snapshot.status) {
    case 'failed_empty_extraction':
      return new ChatUploadError('NEXX could not read any text from this file.', errorOptions);
    case 'failed_processing':
      return new ChatUploadError('NEXX could not finish processing this file. Please retry.', errorOptions);
    case 'stalled':
      return new ChatUploadError('File processing stalled. Please retry.', errorOptions);
    default:
      return new ChatUploadError('Upload did not finish. Please retry.', errorOptions);
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
    uploadAttemptId: snapshot.uploadAttemptId ?? snapshot.attemptId,
    attemptNo: snapshot.attemptNo,
    attachmentRef,
    extractionPreview: snapshot.extractionPreview,
    extractionCharCount: snapshot.extractionCharCount,
    chatContextCharCount: snapshot.chatContextCharCount,
    contextTruncated: snapshot.contextTruncated,
    extractionMethod: snapshot.extractionMethod,
    detectedType: snapshot.detectedType,
    ocrAttempted: snapshot.ocrAttempted,
    pagesOcrProcessed: snapshot.pagesOcrProcessed,
    pagesTotal: snapshot.pagesTotal,
    indexingError: snapshot.indexingError,
    extractionError: snapshot.extractionError,
    warnings: [
      snapshot.indexingError ? `File search indexing did not finish: ${snapshot.indexingError}` : undefined,
      snapshot.extractionError ? `Extraction note: ${snapshot.extractionError}` : undefined,
      ...(snapshot.extractionWarnings ?? []),
    ].filter(Boolean) as string[],
  };
}

function parseSessionSnapshot(value: unknown): UploadSessionSnapshot {
  if (!value || typeof value !== 'object') {
    throw new Error('Upload session returned invalid data.');
  }
  const snapshot = value as UploadSessionSnapshot;
  return {
    ...snapshot,
    uploadAttemptId: snapshot.uploadAttemptId ?? snapshot.attemptId,
    storageId: snapshot.storageId ?? snapshot.existingStorageId,
    uploadedFileId: snapshot.uploadedFileId ?? snapshot.existingUploadedFileId,
  };
}

function pendingAttachKey(uploadSessionId: string) {
  return `${PENDING_ATTACH_PREFIX}${uploadSessionId}`;
}

function persistPendingAttach(args: {
  uploadSessionId: string;
  uploadAttemptId?: string;
  storageId: string;
  conversationId?: string;
  clientUploadKey: string;
  clientTurnId: string;
}) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(pendingAttachKey(args.uploadSessionId), JSON.stringify({
      ...args,
      createdAt: Date.now(),
    }));
  } catch {
    // localStorage recovery is best-effort only.
  }
}

function clearPendingAttach(uploadSessionId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(pendingAttachKey(uploadSessionId));
  } catch {
    // Ignore unavailable localStorage.
  }
}

type PendingAttachRecord = {
  uploadSessionId?: string;
  uploadAttemptId?: string;
  storageId?: string;
  createdAt?: number;
};

export async function recoverPendingChatUploadAttaches(convex: ConvexClientLike) {
  if (typeof window === 'undefined') return 0;
  const now = Date.now();
  let recovered = 0;
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(PENDING_ATTACH_PREFIX)) keys.push(key);
  }

  for (const key of keys) {
    let record: PendingAttachRecord | null = null;
    try {
      record = JSON.parse(window.localStorage.getItem(key) ?? 'null') as PendingAttachRecord | null;
    } catch {
      window.localStorage.removeItem(key);
      continue;
    }

    if (
      !record?.uploadSessionId ||
      !record.storageId ||
      !record.createdAt ||
      now - record.createdAt > 24 * 60 * 60 * 1000
    ) {
      window.localStorage.removeItem(key);
      continue;
    }

    try {
      await convex.mutation(api.chatUploads.attachStorageAndScheduleProcessing, {
        uploadSessionId: record.uploadSessionId as Id<'chatUploadSessions'>,
        uploadAttemptId: record.uploadAttemptId as Id<'chatUploadAttempts'> | undefined,
        storageId: record.storageId as Id<'_storage'>,
      });
      window.localStorage.removeItem(key);
      recovered += 1;
    } catch {
      // Leave the pending record for a later authenticated retry.
    }
  }

  return recovered;
}

async function recordDiagnosticEvent(args: {
  convex: ConvexClientLike;
  event: StorageUploadDiagnosticEvent;
}) {
  try {
    await args.convex.mutation(api.chatUploads.recordUploadClientEvent, {
      uploadSessionId: args.event.diagnostics.sessionId as Id<'chatUploadSessions'>,
      uploadAttemptId: (args.event.diagnostics.attemptId || undefined) as Id<'chatUploadAttempts'> | undefined,
      eventType: args.event.type,
      diagnostics: {
        ...args.event.diagnostics,
        failureKind: args.event.failureKind,
        failureMessageSafe: args.event.failureMessageSafe,
      },
    });
  } catch {
    // Diagnostics must never block upload or retry.
  }
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
      snapshot.status === 'stalled' ||
      snapshot.status === 'cancelled'
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
  let session = existing?.uploadSessionId
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

  if (
    existing?.uploadSessionId &&
    !session.storageId &&
    session.status !== 'ready' &&
    session.status !== 'partial'
  ) {
    session = parseSessionSnapshot(await args.convex.mutation(api.chatUploads.startUploadSession, {
      conversationId: args.conversationId as Id<'conversations'> | undefined,
      caseId: args.caseId as Id<'cases'> | undefined,
      clientUploadKey: args.clientUploadKey,
      filename: args.file.name,
      mimeType: args.file.type || 'application/octet-stream',
      byteSize: args.file.size,
      intent: args.intent,
    }));
  }

  const uploadSessionId = session.uploadSessionId;
  if (!uploadSessionId) throw new Error('Upload session was not created.');
  const uploadAttemptId = session.uploadAttemptId ?? session.attemptId ?? crypto.randomUUID();
  const resolvedClientTurnId = existing?.clientTurnId ?? crypto.randomUUID();
  let storageId = session.storageId ?? existing?.storageId;
  const retryableIndexingPartial = session.status === 'partial' && Boolean(session.indexingError);

  if (!storageId) {
    const uploadUrl = session.uploadUrl ?? existing?.uploadUrl;
    if (!uploadUrl) throw new Error('Upload URL was not created.');
    args.onStatus?.('uploading_to_storage');
    try {
      const upload = await postFileToStorageWithDiagnostics({
        uploadUrl,
        file: args.file,
        sessionId: uploadSessionId,
        attemptId: uploadAttemptId,
        clientUploadKey: args.clientUploadKey,
        clientTurnId: resolvedClientTurnId,
        timeoutMs: 135_000,
        onProgress: ({ percent }) => args.onProgress?.(percent),
        onDiagnosticEvent: (event) => {
          void recordDiagnosticEvent({ convex: args.convex, event });
        },
      });
      storageId = upload.storageId;
      persistPendingAttach({
        uploadSessionId,
        uploadAttemptId,
        storageId,
        conversationId: args.conversationId ? String(args.conversationId) : undefined,
        clientUploadKey: args.clientUploadKey,
        clientTurnId: resolvedClientTurnId,
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
      uploadAttemptId: uploadAttemptId as Id<'chatUploadAttempts'>,
      storageId: storageId as Id<'_storage'>,
    });
    clearPendingAttach(uploadSessionId);
  } else if (!session.uploadedFileId || retryableIndexingPartial) {
    const normalizedStatus = typeof session.status === 'string' ? normalizeStatus(session.status) : undefined;
    if (
      normalizedStatus === 'failed_empty_extraction' ||
      normalizedStatus === 'cancelled' ||
      (session.retryable === false && !retryableIndexingPartial)
    ) {
      throw toUploadError(session);
    }
    if (
      typeof session.processingAttempt === 'number' &&
      session.processingAttempt >= CHAT_UPLOAD_CONFIG.maxProcessingAttempts
    ) {
      throw new ChatUploadError('Maximum processing attempts reached.', {
        uploadStatus: 'failed_processing',
        retryable: false,
        errorCode: session.errorCode,
      });
    }
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
    uploadAttemptId,
    storageId,
  });
}
