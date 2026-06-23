import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { getAuthenticatedUser, getAuthenticatedUserAndConversation, validateCaseOwnership } from './lib/auth';
import { CHAT_UPLOAD_CONFIG, validateChatUploadMetadata } from './lib/chatUploadConfig';

type StorageMetadata = {
  _id: Id<'_storage'>;
  _creationTime: number;
  contentType?: string;
  sha256: string;
  size: number;
};

const uploadIntentValidator = v.union(v.literal('attachment'), v.literal('court_order'));
const uploadDiagnosticsValidator = v.object({
  sessionId: v.optional(v.string()),
  attemptId: v.optional(v.string()),
  clientUploadKey: v.optional(v.string()),
  clientTurnId: v.optional(v.string()),
  fileSize: v.optional(v.number()),
  fileType: v.optional(v.string()),
  fileExtension: v.optional(v.string()),
  uploadUrlHost: v.optional(v.string()),
  uploadUrlProtocol: v.optional(v.string()),
  elapsedMs: v.optional(v.number()),
  readyState: v.optional(v.number()),
  status: v.optional(v.number()),
  statusText: v.optional(v.string()),
  loadedBytes: v.optional(v.number()),
  totalBytes: v.optional(v.number()),
  progressEvents: v.optional(v.number()),
  lastProgressElapsedMs: v.optional(v.union(v.number(), v.null())),
  onlineAtStart: v.optional(v.boolean()),
  onlineAtEnd: v.optional(v.boolean()),
  visibilityState: v.optional(v.string()),
  effectiveType: v.optional(v.string()),
  saveData: v.optional(v.boolean()),
  eventType: v.optional(v.string()),
  failureKind: v.optional(v.string()),
  failureMessageSafe: v.optional(v.string()),
});

const terminalSuccessStatuses = new Set(['ready', 'partial']);
const retryableProcessingStatuses = new Set([
  'stored',
  'processing_queued',
  'failed_processing',
  'stalled',
]);

async function getIdentityClerkId(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Not authenticated');
  return identity.subject;
}

async function getOwnedSession(
  ctx: QueryCtx | MutationCtx,
  uploadSessionId: Id<'chatUploadSessions'>,
) {
  const clerkUserId = await getIdentityClerkId(ctx);
  const session = await ctx.db.get(uploadSessionId);
  if (!session || session.clerkUserId !== clerkUserId) {
    throw new Error('Upload session not found');
  }
  return { clerkUserId, session };
}

async function validateScope(
  ctx: QueryCtx | MutationCtx,
  args: {
    conversationId?: Id<'conversations'>;
    caseId?: Id<'cases'>;
  },
) {
  const user = await getAuthenticatedUser(ctx);
  let caseId = args.caseId;

  if (args.conversationId) {
    const scoped = await getAuthenticatedUserAndConversation(ctx, args.conversationId);
    caseId = scoped.conversation.caseId ?? caseId;
  }

  await validateCaseOwnership(ctx, caseId, user._id);
  return { user, caseId };
}

function toPublicSession(session: Doc<'chatUploadSessions'>, uploadUrl?: string) {
  return {
    uploadSessionId: session._id,
    uploadAttemptId: session.currentAttemptId,
    attemptId: session.currentAttemptId,
    attemptNo: session.attemptNo,
    uploadUrl,
    uploadUrlExpiresAt: session.uploadUrlExpiresAt,
    storageId: session.storageId,
    uploadedFileId: session.uploadedFileId,
    existingStorageId: session.storageId,
    existingUploadedFileId: session.uploadedFileId,
    status: session.status,
    filename: session.filename,
    mimeType: session.mimeType,
    byteSize: session.byteSize,
    processingAttempt: session.processingAttempt,
    errorCode: session.errorCode,
    errorMessage: session.errorMessage,
    retryable: session.retryable,
  };
}

function getUploadUrlParts(uploadUrl: string) {
  try {
    const parsed = new URL(uploadUrl);
    return {
      uploadUrlHost: parsed.host,
      uploadUrlProtocol: parsed.protocol,
    };
  } catch {
    return {};
  }
}

async function createUploadAttempt(
  ctx: MutationCtx,
  args: {
    uploadSessionId: Id<'chatUploadSessions'>;
    clerkUserId: string;
    uploadUrl: string;
    issuedAt: number;
    expiresAt: number;
    attemptNo: number;
  },
) {
  const attemptId = await ctx.db.insert('chatUploadAttempts', {
    uploadSessionId: args.uploadSessionId,
    clerkUserId: args.clerkUserId,
    attemptNo: args.attemptNo,
    status: 'created',
    ...getUploadUrlParts(args.uploadUrl),
    uploadUrlIssuedAt: args.issuedAt,
    uploadUrlExpiresAt: args.expiresAt,
    createdAt: args.issuedAt,
    updatedAt: args.issuedAt,
  });
  await ctx.db.patch(args.uploadSessionId, {
    currentAttemptId: attemptId,
    attemptNo: args.attemptNo,
    updatedAt: args.issuedAt,
  });
  return attemptId;
}

/** Start or resume an idempotent direct-to-storage chat upload session. */
export const startUploadSession = mutation({
  args: {
    conversationId: v.optional(v.id('conversations')),
    caseId: v.optional(v.id('cases')),
    clientUploadKey: v.string(),
    filename: v.string(),
    mimeType: v.string(),
    byteSize: v.number(),
    intent: uploadIntentValidator,
  },
  handler: async (ctx, args) => {
    const { user, caseId } = await validateScope(ctx, {
      conversationId: args.conversationId,
      caseId: args.caseId,
    });
    if (!user.clerkId) throw new Error('Authenticated user is missing clerkId');

    const clientUploadKey = args.clientUploadKey.trim();
    if (!clientUploadKey) throw new Error('clientUploadKey is required');

    const validation = validateChatUploadMetadata({
      filename: args.filename,
      mimeType: args.mimeType,
      byteSize: args.byteSize,
    });
    if (!validation.ok) throw new Error(validation.error);

    const existing = await ctx.db
      .query('chatUploadSessions')
      .withIndex('by_user_client_key', (q) =>
        q.eq('clerkUserId', user.clerkId!).eq('clientUploadKey', clientUploadKey)
      )
      .first();

    if (existing) {
      if (
        existing.filename !== args.filename ||
        existing.byteSize !== args.byteSize ||
        existing.conversationId !== args.conversationId ||
        existing.caseId !== caseId ||
        existing.intent !== args.intent ||
        existing.mimeType !== (args.mimeType || 'application/octet-stream')
      ) {
        throw new Error('Upload session key already belongs to a different file.');
      }

      if (!existing.storageId && existing.status !== 'cancelled') {
        const uploadUrl = await ctx.storage.generateUploadUrl();
        const now = Date.now();
        const attemptNo = (existing.attemptNo ?? 0) + 1;
        const uploadUrlExpiresAt = now + CHAT_UPLOAD_CONFIG.uploadUrlTtlMs;
        const attemptId = await createUploadAttempt(ctx, {
          uploadSessionId: existing._id,
          clerkUserId: user.clerkId!,
          uploadUrl,
          issuedAt: now,
          expiresAt: uploadUrlExpiresAt,
          attemptNo,
        });
        await ctx.db.patch(existing._id, {
          status: 'awaiting_storage_upload',
          uploadUrlIssuedAt: now,
          uploadUrlExpiresAt,
          currentAttemptId: attemptId,
          attemptNo,
          retryable: true,
          errorCode: undefined,
          errorMessage: undefined,
          lastFailureKind: undefined,
          lastFailureMessageSafe: undefined,
          lastFailureDiagnostics: undefined,
          updatedAt: now,
        });
        const refreshed = await ctx.db.get(existing._id);
        return toPublicSession(refreshed ?? existing, uploadUrl);
      }

      return toPublicSession(existing);
    }

    const now = Date.now();
    const uploadUrl = await ctx.storage.generateUploadUrl();
    const uploadUrlExpiresAt = now + CHAT_UPLOAD_CONFIG.uploadUrlTtlMs;
    const uploadSessionId = await ctx.db.insert('chatUploadSessions', {
      clerkUserId: user.clerkId,
      caseId,
      conversationId: args.conversationId,
      clientUploadKey,
      intent: args.intent,
      filename: args.filename,
      mimeType: args.mimeType || 'application/octet-stream',
      extension: validation.extension,
      byteSize: args.byteSize,
      status: 'awaiting_storage_upload',
      uploadUrlIssuedAt: now,
      uploadUrlExpiresAt,
      processingAttempt: 0,
      retryable: true,
      createdAt: now,
      updatedAt: now,
    });
    const attemptId = await createUploadAttempt(ctx, {
      uploadSessionId,
      clerkUserId: user.clerkId,
      uploadUrl,
      issuedAt: now,
      expiresAt: uploadUrlExpiresAt,
      attemptNo: 1,
    });

    console.info('[ChatUpload] session started', {
      uploadSessionId,
      conversationId: args.conversationId,
      mimeType: args.mimeType,
      byteSize: args.byteSize,
      intent: args.intent,
    });

    const session = await ctx.db.get(uploadSessionId);
    if (!session) throw new Error('Upload session was not created');
    return toPublicSession({ ...session, currentAttemptId: attemptId, attemptNo: 1 }, uploadUrl);
  },
});

/** Attach the direct-storage upload result and schedule processing exactly once. */
export const attachStorageAndScheduleProcessing = mutation({
  args: {
    uploadSessionId: v.id('chatUploadSessions'),
    uploadAttemptId: v.optional(v.id('chatUploadAttempts')),
    storageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    const { clerkUserId, session } = await getOwnedSession(ctx, args.uploadSessionId);
    if (session.status === 'cancelled') throw new Error('Upload session was cancelled');

    if (args.uploadAttemptId) {
      const attempt = await ctx.db.get(args.uploadAttemptId);
      if (
        !attempt ||
        attempt.uploadSessionId !== args.uploadSessionId ||
        attempt.clerkUserId !== clerkUserId
      ) {
        throw new Error('Upload attempt does not belong to this session.');
      }
    }

    if (session.storageId && session.storageId !== args.storageId) {
      throw new Error('Upload session already has a different storage file attached.');
    }

    const existingForStorage = await ctx.db
      .query('chatUploadSessions')
      .withIndex('by_storage', (q) => q.eq('storageId', args.storageId))
      .first();
    if (existingForStorage && existingForStorage._id !== args.uploadSessionId) {
      throw new Error('This stored file is already attached to another upload session.');
    }

    const metadata = await ctx.db.system.get('_storage', args.storageId) as StorageMetadata | null;
    if (!metadata) throw new Error('Stored upload file was not found.');
    if (metadata.size !== session.byteSize) {
      throw new Error('Stored upload size did not match the selected file.');
    }
    if (
      metadata.contentType &&
      session.mimeType &&
      session.mimeType !== 'application/octet-stream' &&
      metadata.contentType !== session.mimeType
    ) {
      throw new Error('Stored upload content type did not match the selected file.');
    }

    const now = Date.now();
    const nextStatus = terminalSuccessStatuses.has(session.status) ? session.status : 'processing_queued';
    await ctx.db.patch(args.uploadSessionId, {
      storageId: args.storageId,
      storageSha256: metadata.sha256,
      storageContentType: metadata.contentType,
      storageSize: metadata.size,
      status: nextStatus as Doc<'chatUploadSessions'>['status'],
      errorCode: undefined,
      errorMessage: undefined,
      retryable: !terminalSuccessStatuses.has(session.status),
      updatedAt: now,
    });
    if (args.uploadAttemptId) {
      await ctx.db.patch(args.uploadAttemptId, {
        status: 'attached',
        completedAt: now,
        updatedAt: now,
      });
    }

    console.info('[ChatUpload] storage attached', {
      uploadSessionId: args.uploadSessionId,
      storageId: args.storageId,
      storageSize: metadata.size,
      storageContentType: metadata.contentType,
    });

    if (!terminalSuccessStatuses.has(session.status)) {
      await ctx.scheduler.runAfter(0, internal.chatUploadProcessor.processStoredUpload, {
        uploadSessionId: args.uploadSessionId,
      });
    }

    return { uploadSessionId: args.uploadSessionId, status: nextStatus };
  },
});

/** Record safe, redacted browser upload diagnostics for support/debugging. */
export const recordUploadClientEvent = mutation({
  args: {
    uploadSessionId: v.id('chatUploadSessions'),
    uploadAttemptId: v.optional(v.id('chatUploadAttempts')),
    eventType: v.union(
      v.literal('storage_post_started'),
      v.literal('storage_post_progress'),
      v.literal('storage_post_failed'),
      v.literal('storage_post_succeeded'),
      v.literal('attach_started'),
      v.literal('attach_failed'),
      v.literal('processing_poll_timeout'),
    ),
    diagnostics: uploadDiagnosticsValidator,
  },
  handler: async (ctx, args) => {
    const { clerkUserId, session } = await getOwnedSession(ctx, args.uploadSessionId);
    const diagnostics = args.diagnostics;
    const now = Date.now();

    if (args.uploadAttemptId) {
      const attempt = await ctx.db.get(args.uploadAttemptId);
      if (
        !attempt ||
        attempt.uploadSessionId !== args.uploadSessionId ||
        attempt.clerkUserId !== clerkUserId
      ) {
        throw new Error('Upload attempt does not belong to this session.');
      }
      const failed = args.eventType === 'storage_post_failed';
      const succeeded = args.eventType === 'storage_post_succeeded';
      const isStoragePostEvent = args.eventType.startsWith('storage_post_');
      const status = failed
        ? 'failed'
        : succeeded
          ? 'storage_returned'
          : isStoragePostEvent
            ? 'posting'
            : attempt.status;
      await ctx.db.patch(args.uploadAttemptId, {
        status,
        failureKind: failed && typeof diagnostics.failureKind === 'string' ? diagnostics.failureKind : undefined,
        failureMessageSafe: failed && typeof diagnostics.failureMessageSafe === 'string' ? diagnostics.failureMessageSafe : undefined,
        elapsedMs: typeof diagnostics.elapsedMs === 'number' ? diagnostics.elapsedMs : undefined,
        loadedBytes: typeof diagnostics.loadedBytes === 'number' ? diagnostics.loadedBytes : undefined,
        totalBytes: typeof diagnostics.totalBytes === 'number' ? diagnostics.totalBytes : undefined,
        readyState: typeof diagnostics.readyState === 'number' ? diagnostics.readyState : undefined,
        httpStatus: typeof diagnostics.status === 'number' ? diagnostics.status : undefined,
        browserOnline: typeof diagnostics.onlineAtEnd === 'boolean' ? diagnostics.onlineAtEnd : undefined,
        effectiveType: typeof diagnostics.effectiveType === 'string' ? diagnostics.effectiveType : undefined,
        startedAt: attempt.startedAt ?? now,
        completedAt: failed || succeeded ? now : attempt.completedAt,
        updatedAt: now,
      });
    }

    const failed = args.eventType === 'storage_post_failed';
    const mayApplyStorageFailure =
      failed &&
      !session.storageId &&
      (session.status === 'awaiting_storage_upload' ||
        session.status === 'uploading_to_storage' ||
        session.status === 'failed_storage_upload');
    await ctx.db.patch(args.uploadSessionId, {
      status: mayApplyStorageFailure
        ? 'failed_storage_upload'
        : session.status === 'awaiting_storage_upload'
          ? 'uploading_to_storage'
          : session.status,
      lastClientEventAt: now,
      lastProgressBytes: typeof diagnostics.loadedBytes === 'number' ? diagnostics.loadedBytes : session.lastProgressBytes,
      lastProgressTotalBytes: typeof diagnostics.totalBytes === 'number' ? diagnostics.totalBytes : session.lastProgressTotalBytes,
      lastFailureKind: mayApplyStorageFailure && typeof diagnostics.failureKind === 'string' ? diagnostics.failureKind : session.lastFailureKind,
      lastFailureMessageSafe: mayApplyStorageFailure && typeof diagnostics.failureMessageSafe === 'string' ? diagnostics.failureMessageSafe : session.lastFailureMessageSafe,
      lastFailureDiagnostics: mayApplyStorageFailure ? {
        failureKind: diagnostics.failureKind,
        failureMessageSafe: diagnostics.failureMessageSafe,
        elapsedMs: diagnostics.elapsedMs,
        readyState: diagnostics.readyState,
        status: diagnostics.status,
        statusText: diagnostics.statusText,
        loadedBytes: diagnostics.loadedBytes,
        totalBytes: diagnostics.totalBytes,
        progressEvents: diagnostics.progressEvents,
        lastProgressElapsedMs: diagnostics.lastProgressElapsedMs,
        onlineAtStart: diagnostics.onlineAtStart,
        onlineAtEnd: diagnostics.onlineAtEnd,
        visibilityState: diagnostics.visibilityState,
        effectiveType: diagnostics.effectiveType,
        saveData: diagnostics.saveData,
        uploadUrlHost: diagnostics.uploadUrlHost,
        uploadUrlProtocol: diagnostics.uploadUrlProtocol,
      } : session.lastFailureDiagnostics,
      retryable: mayApplyStorageFailure ? true : session.retryable,
      updatedAt: now,
    });

    return true;
  },
});

/** Pollable session state for the browser upload client. */
export const getUploadSession = query({
  args: {
    uploadSessionId: v.id('chatUploadSessions'),
  },
  handler: async (ctx, args) => {
    const { session } = await getOwnedSession(ctx, args.uploadSessionId);
    let uploadedFile: Doc<'uploadedFiles'> | null = null;
    if (session.uploadedFileId) {
      uploadedFile = await ctx.db.get(session.uploadedFileId);
    }

    return {
      uploadSessionId: session._id,
      status: session.status,
      filename: session.filename,
      mimeType: session.mimeType,
      byteSize: session.byteSize,
      storageId: session.storageId,
      uploadedFileId: session.uploadedFileId,
      processingAttempt: session.processingAttempt,
      errorCode: session.errorCode,
      errorMessage: session.errorMessage,
      retryable: session.retryable,
      updatedAt: session.updatedAt,
      extractionPreview: uploadedFile?.chatContextText?.slice(0, CHAT_UPLOAD_CONFIG.maxUploadResponsePreviewChars),
      extractionCharCount: uploadedFile?.extractionCharCount,
      chatContextCharCount: uploadedFile?.chatContextCharCount,
      contextTruncated: uploadedFile?.contextTruncated,
      extractionMethod: uploadedFile?.extractionMethod,
      detectedType: uploadedFile?.detectedType,
      extractionWarnings: uploadedFile?.extractionWarnings,
      ocrAttempted: uploadedFile?.ocrAttempted,
      pagesOcrProcessed: uploadedFile?.pagesOcrProcessed,
      pagesTotal: uploadedFile?.pagesTotal,
      indexingError: uploadedFile?.indexingError,
      extractionError: uploadedFile?.extractionError,
    };
  },
});

/** Retry processing for an already stored file without reuploading the binary. */
export const retryProcessing = mutation({
  args: {
    uploadSessionId: v.id('chatUploadSessions'),
  },
  handler: async (ctx, args) => {
    const { session } = await getOwnedSession(ctx, args.uploadSessionId);
    if (!session.storageId) throw new Error('No stored file is available to process.');
    if (!retryableProcessingStatuses.has(session.status)) {
      if (terminalSuccessStatuses.has(session.status)) {
        return { uploadSessionId: args.uploadSessionId, status: session.status };
      }
      throw new Error(`Upload session is not retryable from status ${session.status}.`);
    }
    if (session.processingAttempt >= CHAT_UPLOAD_CONFIG.maxProcessingAttempts) {
      throw new Error('Maximum processing attempts reached.');
    }

    await ctx.db.patch(args.uploadSessionId, {
      status: 'processing_queued',
      errorCode: undefined,
      errorMessage: undefined,
      retryable: true,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.chatUploadProcessor.processStoredUpload, {
      uploadSessionId: args.uploadSessionId,
    });
    return { uploadSessionId: args.uploadSessionId, status: 'processing_queued' };
  },
});

/** Cancel an abandoned upload session and delete unattached storage when safe. */
export const cancelUploadSession = mutation({
  args: {
    uploadSessionId: v.id('chatUploadSessions'),
  },
  handler: async (ctx, args) => {
    const { session } = await getOwnedSession(ctx, args.uploadSessionId);
    if (session.status === 'processing') {
      return null;
    }
    if (session.uploadedFileId) {
      await ctx.db.patch(args.uploadSessionId, {
        status: 'cancelled',
        retryable: false,
        updatedAt: Date.now(),
      });
      return null;
    }

    if (session.storageId) {
      await ctx.storage.delete(session.storageId);
    }
    await ctx.db.patch(args.uploadSessionId, {
      status: 'cancelled',
      retryable: false,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const getProcessingSession = internalQuery({
  args: {
    uploadSessionId: v.id('chatUploadSessions'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.uploadSessionId);
  },
});

export const getProcessingContext = internalQuery({
  args: {
    uploadSessionId: v.id('chatUploadSessions'),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.uploadSessionId);
    if (!session) return null;
    const conversation = session.conversationId ? await ctx.db.get(session.conversationId) : null;
    return { session, conversation };
  },
});

export const setConversationVectorStoreForSession = internalMutation({
  args: {
    uploadSessionId: v.id('chatUploadSessions'),
    vectorStoreId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.uploadSessionId);
    if (!session?.conversationId) return { vectorStoreId: args.vectorStoreId, wasSet: false };
    const conversation = await ctx.db.get(session.conversationId);
    if (!conversation) return { vectorStoreId: args.vectorStoreId, wasSet: false };
    if (conversation.vectorStoreId) return { vectorStoreId: conversation.vectorStoreId, wasSet: false };
    await ctx.db.patch(session.conversationId, { vectorStoreId: args.vectorStoreId });
    return { vectorStoreId: args.vectorStoreId, wasSet: true };
  },
});

export const claimProcessingLock = internalMutation({
  args: {
    uploadSessionId: v.id('chatUploadSessions'),
    lockId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.uploadSessionId);
    if (!session) return { status: 'missing' as const };
    if (terminalSuccessStatuses.has(session.status)) {
      return { status: 'already_done' as const, uploadedFileId: session.uploadedFileId };
    }
    if (!session.storageId) return { status: 'missing_storage' as const };

    const now = Date.now();
    const freshProcessing =
      session.status === 'processing' &&
      session.processingStartedAt &&
      now - session.processingStartedAt < CHAT_UPLOAD_CONFIG.processingStaleAfterMs;
    if (freshProcessing) return { status: 'already_processing' as const };

    if (!retryableProcessingStatuses.has(session.status) && session.status !== 'awaiting_storage_upload') {
      return { status: 'not_retryable' as const, currentStatus: session.status };
    }
    if (session.processingAttempt >= CHAT_UPLOAD_CONFIG.maxProcessingAttempts) {
      await ctx.db.patch(args.uploadSessionId, {
        status: 'failed_processing',
        errorCode: 'max_processing_attempts',
        errorMessage: 'Maximum processing attempts reached.',
        retryable: false,
        updatedAt: now,
      });
      return { status: 'max_attempts' as const };
    }

    await ctx.db.patch(args.uploadSessionId, {
      status: 'processing',
      processingAttempt: session.processingAttempt + 1,
      processingLockId: args.lockId,
      processingStartedAt: now,
      errorCode: undefined,
      errorMessage: undefined,
      updatedAt: now,
    });

    return {
      status: 'claimed' as const,
      session: {
        ...session,
        status: 'processing' as const,
        processingAttempt: session.processingAttempt + 1,
        processingLockId: args.lockId,
        processingStartedAt: now,
      },
    };
  },
});

export const completeProcessing = internalMutation({
  args: {
    uploadSessionId: v.id('chatUploadSessions'),
    lockId: v.string(),
    status: v.union(v.literal('ready'), v.literal('partial')),
    partial: v.optional(v.boolean()),
    uploadedFileId: v.id('uploadedFiles'),
    indexingError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.uploadSessionId);
    if (!session || session.processingLockId !== args.lockId) return null;
    const now = Date.now();
    await ctx.db.patch(args.uploadSessionId, {
      status: args.status,
      uploadedFileId: args.uploadedFileId,
      errorCode: args.indexingError ? 'indexing_partial_failure' : undefined,
      errorMessage: args.indexingError,
      retryable: false,
      processingFinishedAt: now,
      updatedAt: now,
    });
    return true;
  },
});

export const failProcessing = internalMutation({
  args: {
    uploadSessionId: v.id('chatUploadSessions'),
    lockId: v.string(),
    status: v.union(v.literal('failed_processing'), v.literal('failed_empty_extraction')),
    errorCode: v.string(),
    errorMessage: v.string(),
    retryable: v.boolean(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.uploadSessionId);
    if (!session || session.processingLockId !== args.lockId) return null;
    const now = Date.now();
    await ctx.db.patch(args.uploadSessionId, {
      status: args.status,
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      retryable: args.retryable,
      processingFinishedAt: now,
      updatedAt: now,
    });
    return true;
  },
});

export const upsertProcessedUploadedFile = internalMutation({
  args: {
    uploadSessionId: v.id('chatUploadSessions'),
    lockId: v.string(),
    status: v.union(v.literal('ready'), v.literal('partial')),
    fullTextStorageId: v.optional(v.id('_storage')),
    fullTextSha256: v.optional(v.string()),
    chatContextText: v.string(),
    chatContextCharCount: v.number(),
    contextTruncated: v.boolean(),
    extractionMethod: v.optional(v.string()),
    detectedType: v.optional(v.string()),
    extractionWarnings: v.optional(v.array(v.string())),
    extractionVersion: v.optional(v.string()),
    extractionCharCount: v.number(),
    extractionError: v.optional(v.string()),
    indexingError: v.optional(v.string()),
    ocrAttempted: v.optional(v.boolean()),
    pagesOcrProcessed: v.optional(v.number()),
    pagesTotal: v.optional(v.number()),
    openaiFileId: v.optional(v.string()),
    openaiTextFileId: v.optional(v.string()),
    vectorStoreId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.uploadSessionId);
    if (!session || !session.storageId) throw new Error('Upload session missing storage');
    if (session.processingLockId !== args.lockId) throw new Error('Upload processing lock is no longer valid');
    const now = Date.now();

    if (session.uploadedFileId) {
      await ctx.db.patch(session.uploadedFileId, {
        status: args.status,
        fullTextStorageId: args.fullTextStorageId,
        fullTextSha256: args.fullTextSha256,
        chatContextText: args.chatContextText,
        chatContextCharCount: args.chatContextCharCount,
        contextTruncated: args.contextTruncated,
        extractionMethod: args.extractionMethod,
        detectedType: args.detectedType,
        extractionWarnings: args.extractionWarnings,
        extractionVersion: args.extractionVersion,
        extractionCharCount: args.extractionCharCount,
        extractionError: args.extractionError,
        indexingError: args.indexingError,
        ocrAttempted: args.ocrAttempted,
        pagesOcrProcessed: args.pagesOcrProcessed,
        pagesTotal: args.pagesTotal,
        openaiFileId: args.openaiFileId,
        openaiTextFileId: args.openaiTextFileId,
        vectorStoreId: args.vectorStoreId,
        updatedAt: now,
      });
      return session.uploadedFileId;
    }

    const uploadedFileId = await ctx.db.insert('uploadedFiles', {
      clerkUserId: session.clerkUserId,
      conversationId: session.conversationId,
      caseId: session.caseId,
      uploadSessionId: args.uploadSessionId,
      filename: session.filename,
      mimeType: session.mimeType,
      extension: session.extension,
      byteSize: session.byteSize,
      storageId: session.storageId,
      storageSha256: session.storageSha256,
      status: args.status,
      fullTextStorageId: args.fullTextStorageId,
      fullTextSha256: args.fullTextSha256,
      chatContextText: args.chatContextText,
      chatContextCharCount: args.chatContextCharCount,
      contextTruncated: args.contextTruncated,
      extractionMethod: args.extractionMethod,
      detectedType: args.detectedType,
      extractionWarnings: args.extractionWarnings,
      extractionVersion: args.extractionVersion,
      extractionCharCount: args.extractionCharCount,
      extractionError: args.extractionError,
      indexingError: args.indexingError,
      ocrAttempted: args.ocrAttempted,
      pagesOcrProcessed: args.pagesOcrProcessed,
      pagesTotal: args.pagesTotal,
      openaiFileId: args.openaiFileId,
      openaiTextFileId: args.openaiTextFileId,
      vectorStoreId: args.vectorStoreId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.uploadSessionId, { uploadedFileId, updatedAt: now });
    return uploadedFileId;
  },
});

export const validateAttachmentsForChat = query({
  args: {
    conversationId: v.id('conversations'),
    attachments: v.array(v.object({
      uploadedFileId: v.id('uploadedFiles'),
      uploadSessionId: v.id('chatUploadSessions'),
      storageId: v.id('_storage'),
      filename: v.string(),
      mimeType: v.string(),
      byteSize: v.number(),
      status: v.union(v.literal('ready'), v.literal('partial')),
    })),
  },
  handler: async (ctx, args) => {
    const clerkUserId = await getIdentityClerkId(ctx);
    await getAuthenticatedUserAndConversation(ctx, args.conversationId);
    if (args.attachments.length > 5) {
      throw new Error('Too many attachments for one chat turn.');
    }

    const sanitized = [];
    for (const attachment of args.attachments) {
      const uploadedFile = await ctx.db.get(attachment.uploadedFileId);
      if (
        !uploadedFile ||
        uploadedFile.clerkUserId !== clerkUserId ||
        uploadedFile.conversationId !== args.conversationId ||
        uploadedFile.uploadSessionId !== attachment.uploadSessionId ||
        uploadedFile.storageId !== attachment.storageId ||
        (uploadedFile.status !== 'ready' && uploadedFile.status !== 'partial')
      ) {
        throw new Error('Attachment is not ready or does not belong to this conversation.');
      }
      sanitized.push({
        uploadedFileId: uploadedFile._id,
        uploadSessionId: attachment.uploadSessionId,
        storageId: attachment.storageId,
        filename: uploadedFile.filename,
        mimeType: uploadedFile.mimeType,
        byteSize: uploadedFile.byteSize ?? attachment.byteSize,
        status: uploadedFile.status as 'ready' | 'partial',
      });
    }

    return sanitized;
  },
});

export const cleanupStaleUploadSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const staleProcessing = await ctx.db
      .query('chatUploadSessions')
      .withIndex('by_status_updated', (q) => q.eq('status', 'processing'))
      .take(50);

    let stalled = 0;
    for (const session of staleProcessing) {
      if (now - (session.processingStartedAt ?? session.updatedAt) < CHAT_UPLOAD_CONFIG.processingStaleAfterMs) continue;
      await ctx.db.patch(session._id, {
        status: 'stalled',
        errorCode: 'processing_stalled',
        errorMessage: 'Upload processing stalled before completion.',
        retryable: true,
        updatedAt: now,
      });
      stalled++;
    }

    const cleanupStatuses = [
      'awaiting_storage_upload',
      'failed_storage_upload',
      'failed_processing',
      'failed_empty_extraction',
      'stalled',
      'cancelled',
    ] as const;

    let deleted = 0;
    for (const status of cleanupStatuses) {
      const expired = await ctx.db
        .query('chatUploadSessions')
        .withIndex('by_status_updated', (q) => q.eq('status', status))
        .take(25);

      for (const session of expired) {
        if (now - session.updatedAt < CHAT_UPLOAD_CONFIG.uploadSessionTtlMs) continue;
        if (session.uploadedFileId) continue;
        if (session.storageId) {
          await ctx.storage.delete(session.storageId);
        }
        await ctx.db.delete(session._id);
        deleted++;
      }
    }

    return { stalled, deleted };
  },
});
