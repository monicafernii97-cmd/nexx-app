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
  StorageUploadError,
  type StorageUploadDiagnosticEvent,
} from './uploadErrors';
import { shouldPersistUploadProgressDiagnostic } from './uploadShared';
import { analysisModeForUploadIntent } from './documentAnalysisMode';

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
  clientSha256?: string;
  processingAttempt?: number;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  nextStorageRetryAt?: number;
  lastTransport?: 'direct' | 'fallback' | 'resumable';
  extractionPreview?: string;
  extractionCharCount?: number;
  chatContextCharCount?: number;
  contextTruncated?: boolean;
  extractionMethod?: string;
  detectedType?: string;
  extractionWarnings?: string[];
  ocrAttempted?: boolean;
  pagesOcrProcessed?: number;
  lowConfidenceUnits?: number;
  pagesTotal?: number;
  indexingError?: string;
  extractionError?: string;
  coverageStatus?: 'complete' | 'partial' | 'failed' | 'unverified';
  coverageExpectedUnits?: number;
  coverageAccountedUnits?: number;
  fullDocumentReviewStatus?: 'not_started' | 'building' | 'ready' | 'partial' | 'failed';
};

export class ChatUploadError extends Error {
  uploadStatus?: ChatComposerFileStatus;
  retryable?: boolean;
  errorCode?: string;
  nextStorageRetryAt?: number;

  constructor(message: string, options: {
    uploadStatus?: ChatComposerFileStatus;
    retryable?: boolean;
    errorCode?: string;
    nextStorageRetryAt?: number;
  } = {}) {
    super(message);
    this.name = 'ChatUploadError';
    this.uploadStatus = options.uploadStatus;
    this.retryable = options.retryable;
    this.errorCode = options.errorCode;
    this.nextStorageRetryAt = options.nextStorageRetryAt;
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
  clientSha256?: string;
  nextStorageRetryAt?: number;
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

type ResumableUploadTicket =
  | { alreadyStored: true; uploadSessionId: string; storageId: string }
  | {
      alreadyStored: false;
      uploadSessionId: string;
      uploadAttemptId: string;
      attemptNo: number;
      resumableUploadId: string;
      chunkBytes: number;
      chunkCount: number;
      chunkUploadUrl: string;
      completeUrl: string;
      expiresAt: number;
    };

function waitMs(delayMs: number) {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, Math.max(0, delayMs)));
}

function createFallbackBearerToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Blob(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function resumableUrl(base: string, args: Record<string, string | number>) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(args)) url.searchParams.set(key, String(value));
  return url.toString();
}

export async function postResumableRequest(args: {
  url: string;
  bearerToken: string;
  body?: Blob;
  chunkSha256?: string;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), args.timeoutMs ?? 90_000);
  try {
    const response = await fetch(args.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.bearerToken}`,
        'Content-Type': args.body?.type || 'application/octet-stream',
        ...(args.chunkSha256 ? { 'X-Chunk-SHA256': args.chunkSha256 } : {}),
      },
      body: args.body,
      signal: controller.signal,
    });
    const parsed = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      throw new Error(typeof parsed?.error === 'string' ? parsed.error : `Resumable upload failed with HTTP ${response.status}.`);
    }
    return parsed ?? {};
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function uploadResumableFile(args: {
  convex: ConvexClientLike;
  file: File;
  fileSha256: string;
  ticket: Extract<ResumableUploadTicket, { alreadyStored: false }>;
  bearerToken: string;
  onProgress?: (progress: number) => void;
}) {
  const status = await args.convex.query(api.chatUploads.getResumableUploadStatus, {
    resumableUploadId: args.ticket.resumableUploadId as Id<'chatUploadResumableUploads'>,
  }) as { storedChunkIndexes?: number[]; storageId?: string; status?: string };
  if (status.storageId) return status.storageId;
  const stored = new Set(status.storedChunkIndexes ?? []);
  let storedBytes = 0;
  for (const chunkIndex of stored) {
    const start = chunkIndex * args.ticket.chunkBytes;
    storedBytes += Math.min(args.ticket.chunkBytes, args.file.size - start);
  }
  args.onProgress?.(Math.min(99, Math.round((storedBytes / args.file.size) * 100)));

  let failureCode = 'resumable_chunk_transport_failed';
  try {
    for (let chunkIndex = 0; chunkIndex < args.ticket.chunkCount; chunkIndex += 1) {
      if (stored.has(chunkIndex)) continue;
      const start = chunkIndex * args.ticket.chunkBytes;
      const end = Math.min(args.file.size, start + args.ticket.chunkBytes);
      const chunk = args.file.slice(start, end, 'application/octet-stream');
      const chunkSha256 = await sha256Blob(chunk);
      let completed = false;
      let lastError: unknown;
      for (let attempt = 0; attempt < CHAT_UPLOAD_CONFIG.maxChunkAttempts; attempt += 1) {
        if (attempt > 0) {
          await waitMs(Math.min(
            CHAT_UPLOAD_CONFIG.storageRetryMaxDelayMs,
            CHAT_UPLOAD_CONFIG.storageRetryBaseDelayMs * (2 ** (attempt - 1)),
          ));
        }
        try {
          await postResumableRequest({
            url: resumableUrl(args.ticket.chunkUploadUrl, {
              uploadSessionId: args.ticket.uploadSessionId,
              resumableUploadId: args.ticket.resumableUploadId,
              chunkIndex,
            }),
            bearerToken: args.bearerToken,
            body: chunk,
            chunkSha256,
          });
          completed = true;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!completed) {
        failureCode = lastError instanceof DOMException && lastError.name === 'AbortError'
          ? 'resumable_chunk_timeout'
          : 'resumable_chunk_transport_failed';
        throw lastError ?? new Error('A resumable chunk did not finish.');
      }
      storedBytes += chunk.size;
      args.onProgress?.(Math.min(99, Math.round((storedBytes / args.file.size) * 100)));
    }

    failureCode = 'resumable_completion_unconfirmed';
    let completionError: unknown;
    for (let attempt = 0; attempt < CHAT_UPLOAD_CONFIG.maxChunkAttempts; attempt += 1) {
      if (attempt > 0) {
        await waitMs(Math.min(
          CHAT_UPLOAD_CONFIG.storageRetryMaxDelayMs,
          CHAT_UPLOAD_CONFIG.storageRetryBaseDelayMs * (2 ** (attempt - 1)),
        ));
      }
      try {
        const completed = await postResumableRequest({
          url: resumableUrl(args.ticket.completeUrl, {
            uploadSessionId: args.ticket.uploadSessionId,
            resumableUploadId: args.ticket.resumableUploadId,
          }),
          bearerToken: args.bearerToken,
          timeoutMs: 120_000,
        });
        if (typeof completed.storageId === 'string') return completed.storageId;
      } catch (error) {
        completionError = error;
      }
      const reconciled = parseSessionSnapshot(await args.convex.query(api.chatUploads.getUploadSession, {
        uploadSessionId: args.ticket.uploadSessionId as Id<'chatUploadSessions'>,
      }));
      if (reconciled.storageId) return reconciled.storageId;
    }
    throw completionError ?? new Error('Resumable upload completion was not confirmed.');
  } catch (error) {
    await args.convex.mutation(api.chatUploads.failOwnedResumableUpload, {
      resumableUploadId: args.ticket.resumableUploadId as Id<'chatUploadResumableUploads'>,
      failureCode: error instanceof DOMException && error.name === 'AbortError'
        ? failureCode === 'resumable_completion_unconfirmed'
          ? 'resumable_completion_timeout'
          : 'resumable_chunk_timeout'
        : failureCode,
    }).catch(() => undefined);
    throw new ChatUploadError(
      'The direct and resumable storage routes could not complete. Switch networks or disable a VPN/privacy blocker before retrying.',
      { uploadStatus: 'failed_storage_upload', retryable: true, errorCode: failureCode },
    );
  }
}

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
  if (status === 'quarantined') return 'quarantined';
  if (status === 'stalled') return 'stalled';
  if (status === 'cancelled') return 'cancelled';
  return 'failed_processing';
}

function toUploadError(snapshot: UploadSessionSnapshot) {
  const uploadStatus = typeof snapshot.status === 'string' ? normalizeStatus(snapshot.status) : undefined;
  const retryable = snapshot.retryable ?? (
    uploadStatus !== 'failed_empty_extraction' &&
    uploadStatus !== 'quarantined' &&
    uploadStatus !== 'cancelled'
  );
  const errorOptions = {
    uploadStatus,
    retryable,
    errorCode: snapshot.errorCode,
    nextStorageRetryAt: snapshot.nextStorageRetryAt,
  };

  if (snapshot.errorMessage) return new ChatUploadError(snapshot.errorMessage, errorOptions);
  switch (snapshot.status) {
    case 'failed_empty_extraction':
      return new ChatUploadError('NEXX could not read any text from this file.', errorOptions);
    case 'failed_processing':
      return new ChatUploadError('NEXX could not finish processing this file. Please retry.', errorOptions);
    case 'quarantined':
      return new ChatUploadError('This file was isolated because it contains unsafe or active content. Export a clean copy before uploading again.', errorOptions);
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

function buildChatUploadResponse(snapshot: UploadSessionSnapshot, intent: ChatUploadIntent): ChatUploadResponse {
  assertReadyUpload(snapshot);
  const attachmentRef: ChatAttachmentRef = {
    uploadedFileId: snapshot.uploadedFileId,
    uploadSessionId: snapshot.uploadSessionId,
    storageId: snapshot.storageId,
    filename: snapshot.filename,
    mimeType: snapshot.mimeType,
    byteSize: snapshot.byteSize,
    status: snapshot.status,
    analysisMode: analysisModeForUploadIntent(intent),
    extractionMethod: snapshot.extractionMethod,
    pagesProcessed: snapshot.coverageAccountedUnits ?? snapshot.pagesOcrProcessed,
    pagesTotal: snapshot.coverageExpectedUnits ?? snapshot.pagesTotal,
    pagesOcrProcessed: snapshot.pagesOcrProcessed,
    lowConfidenceUnits: snapshot.lowConfidenceUnits,
    contextTruncated: snapshot.contextTruncated,
    extractionWarnings: snapshot.extractionWarnings,
    coverageStatus: snapshot.coverageStatus,
    fullDocumentReviewStatus: snapshot.fullDocumentReviewStatus,
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

function createThrottledDiagnosticRecorder(convex: ConvexClientLike) {
  let lastProgressRecordedAt = 0;
  let lastProgressPercent = -CHAT_UPLOAD_CONFIG.progressDiagnosticMinPercentDelta;
  const terminalWrites: Promise<void>[] = [];

  return {
    handle(event: StorageUploadDiagnosticEvent) {
      if (event.type === 'storage_post_progress') {
        const now = Date.now();
        const total = event.diagnostics.totalBytes;
        const percent = total > 0
          ? Math.floor((event.diagnostics.loadedBytes / total) * 100)
          : 0;
        if (!shouldPersistUploadProgressDiagnostic({
          now,
          lastRecordedAt: lastProgressRecordedAt,
          percent,
          lastRecordedPercent: lastProgressPercent,
        })) return;
        lastProgressRecordedAt = now;
        lastProgressPercent = percent;
      }

      const write = recordDiagnosticEvent({ convex, event });
      if (event.type === 'storage_post_failed' || event.type === 'storage_post_succeeded') {
        terminalWrites.push(write);
      }
    },
    async flushTerminal() {
      if (terminalWrites.length === 0) return;
      await Promise.all(terminalWrites.splice(0, terminalWrites.length));
    },
  };
}

async function refreshSessionAfterRetryDelay(args: {
  convex: ConvexClientLike;
  session: UploadSessionSnapshot;
  file: File;
  conversationId?: Id<'conversations'> | string;
  caseId?: Id<'cases'> | string;
  intent: ChatUploadIntent;
  clientUploadKey: string;
  clientSha256: string;
}) {
  const retryAt = args.session.nextStorageRetryAt;
  if (!retryAt || retryAt <= Date.now()) return args.session;
  await waitMs(retryAt - Date.now());
  return parseSessionSnapshot(await args.convex.mutation(api.chatUploads.startUploadSession, {
    conversationId: args.conversationId as Id<'conversations'> | undefined,
    caseId: args.caseId as Id<'cases'> | undefined,
    clientUploadKey: args.clientUploadKey,
    filename: args.file.name,
    mimeType: args.file.type || 'application/octet-stream',
    byteSize: args.file.size,
    clientSha256: args.clientSha256,
    intent: args.intent,
  }));
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
      snapshot.status === 'quarantined' ||
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
  let session: UploadSessionSnapshot;
  let fileSha256 = existing?.clientSha256;
  if (existing?.uploadSessionId) {
    session = parseSessionSnapshot(await args.convex.query(api.chatUploads.getUploadSession, {
      uploadSessionId: existing.uploadSessionId as Id<'chatUploadSessions'>,
    }));
    fileSha256 = session.clientSha256 ?? fileSha256 ?? await sha256Blob(args.file);
  } else {
    fileSha256 = await sha256Blob(args.file);
    session = parseSessionSnapshot(await args.convex.mutation(api.chatUploads.startUploadSession, {
      conversationId: args.conversationId as Id<'conversations'> | undefined,
      caseId: args.caseId as Id<'cases'> | undefined,
      clientUploadKey: args.clientUploadKey,
      filename: args.file.name,
      mimeType: args.file.type || 'application/octet-stream',
      byteSize: args.file.size,
      clientSha256: fileSha256,
      intent: args.intent,
    }));
  }

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
      clientSha256: fileSha256,
      intent: args.intent,
    }));
  }

  session = await refreshSessionAfterRetryDelay({
    convex: args.convex,
    session,
    file: args.file,
    conversationId: args.conversationId,
    caseId: args.caseId,
    intent: args.intent,
    clientUploadKey: args.clientUploadKey,
    clientSha256: fileSha256,
  });

  const uploadSessionId = session.uploadSessionId;
  if (!uploadSessionId) throw new Error('Upload session was not created.');
  const uploadAttemptId = session.uploadAttemptId ?? session.attemptId ?? crypto.randomUUID();
  const resolvedClientTurnId = existing?.clientTurnId ?? crypto.randomUUID();
  let storageId = session.storageId ?? existing?.storageId;
  const retryableIndexingPartial = session.status === 'partial' && Boolean(session.indexingError);
  const retryableProcessingFailure = session.status === 'failed_processing' || session.status === 'stalled';

  if (!storageId) {
    const uploadUrl = session.uploadUrl ?? existing?.uploadUrl;
    if (!uploadUrl) throw toUploadError(session);
    args.onStatus?.('uploading_to_storage');
    let resolvedAttemptId = uploadAttemptId;
    const directDiagnosticRecorder = createThrottledDiagnosticRecorder(args.convex);
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
        onDiagnosticEvent: directDiagnosticRecorder.handle,
      });
      await directDiagnosticRecorder.flushTerminal();
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
    } catch (directError) {
      await directDiagnosticRecorder.flushTerminal();
      const directFailureDiagnostics = directError instanceof StorageUploadError
        ? directError.diagnostics
        : undefined;
      const fallbackEligible = directError instanceof StorageUploadError && directError.retryable;

      if (!fallbackEligible) {
        args.onStatus?.('failed_storage_upload');
        throw directError;
      }

      if (directError.kind === 'response_lost') {
        try {
          const reconciled = await args.convex.mutation(api.chatUploads.reconcileDirectUpload, {
            uploadSessionId: uploadSessionId as Id<'chatUploadSessions'>,
            uploadAttemptId: uploadAttemptId as Id<'chatUploadAttempts'>,
            clientSha256: fileSha256,
          }) as { reconciled: boolean; storageId?: string };
          if (reconciled.reconciled && reconciled.storageId) storageId = reconciled.storageId;
        } catch {
          // Reconciliation is best-effort. The resumable route remains available.
        }
      }

      if (!storageId) {
        const failedSession = parseSessionSnapshot(await args.convex.query(api.chatUploads.getUploadSession, {
          uploadSessionId: uploadSessionId as Id<'chatUploadSessions'>,
        }));
        if (failedSession.retryable === false) throw toUploadError(failedSession);
        if (failedSession.nextStorageRetryAt && failedSession.nextStorageRetryAt > Date.now()) {
          await waitMs(failedSession.nextStorageRetryAt - Date.now());
        }

        const bearerToken = createFallbackBearerToken();
        const tokenHash = await sha256Hex(bearerToken);
        const fallback = await args.convex.mutation(api.chatUploads.issueResumableUpload, {
          uploadSessionId: uploadSessionId as Id<'chatUploadSessions'>,
          tokenHash,
          clientSha256: fileSha256,
        }) as ResumableUploadTicket;
        if (fallback.alreadyStored) {
          storageId = fallback.storageId;
        } else {
          resolvedAttemptId = fallback.uploadAttemptId;
          args.onStatus?.('uploading_to_storage');
          try {
            storageId = await uploadResumableFile({
              convex: args.convex,
              file: args.file,
              fileSha256,
              ticket: fallback,
              bearerToken,
              onProgress: args.onProgress,
            });
          } catch (fallbackError) {
            const reconciled = parseSessionSnapshot(await args.convex.query(api.chatUploads.getUploadSession, {
              uploadSessionId: uploadSessionId as Id<'chatUploadSessions'>,
            }));
            if (reconciled.storageId) {
              storageId = reconciled.storageId;
              session = reconciled;
            } else {
              args.onStatus?.('failed_storage_upload');
              if (reconciled.retryable === false) throw toUploadError(reconciled);
              if (directFailureDiagnostics?.loadedBytes === directFailureDiagnostics?.totalBytes) {
                throw new ChatUploadError(
                  'Storage confirmation was lost and the secure fallback could not complete. Switch networks or disable a VPN/privacy blocker, then retry.',
                  {
                    uploadStatus: 'failed_storage_upload',
                    retryable: reconciled.retryable ?? true,
                    nextStorageRetryAt: reconciled.nextStorageRetryAt,
                  },
                );
              }
              throw new ChatUploadError(
                fallbackError instanceof Error ? fallbackError.message : 'The resumable upload did not finish.',
                {
                  uploadStatus: 'failed_storage_upload',
                  retryable: reconciled.retryable ?? true,
                  nextStorageRetryAt: reconciled.nextStorageRetryAt,
                },
              );
            }
          }
        }
      }

      persistPendingAttach({
        uploadSessionId,
        uploadAttemptId: resolvedAttemptId,
        storageId,
        conversationId: args.conversationId ? String(args.conversationId) : undefined,
        clientUploadKey: args.clientUploadKey,
        clientTurnId: resolvedClientTurnId,
      });
      args.onStorageReady?.({ uploadSessionId, storageId });
      args.onProgress?.(100);
    }

    args.onStatus?.('stored');
    await args.convex.mutation(api.chatUploads.attachStorageAndScheduleProcessing, {
      uploadSessionId: uploadSessionId as Id<'chatUploadSessions'>,
      uploadAttemptId: resolvedAttemptId as Id<'chatUploadAttempts'>,
      storageId: storageId as Id<'_storage'>,
    });
    clearPendingAttach(uploadSessionId);
  } else if (!session.uploadedFileId || retryableIndexingPartial || retryableProcessingFailure) {
    const normalizedStatus = typeof session.status === 'string' ? normalizeStatus(session.status) : undefined;
    if (
      normalizedStatus === 'failed_empty_extraction' ||
      normalizedStatus === 'quarantined' ||
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
  }, args.intent);
}
