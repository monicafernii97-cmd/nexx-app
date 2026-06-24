import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { getAuthenticatedUserAndConversation } from './lib/auth';
import {
    detectDocumentReference,
    type DocumentReferenceDetection,
} from '../src/lib/nexx/documentReferenceDetection';
import {
    detectStoredDocumentAmbiguity,
    normalizeDocumentAlias,
    selectStoredDocumentCandidates,
} from '../src/lib/nexx/documentSelection';
import { retrieveRelevantDocumentChunks } from '../src/lib/nexx/documentChunkRetrieval';
import {
    canUseDocumentMemoryCandidate,
    resolveDocumentMemorySource,
    type DocumentMemorySource,
} from '../src/lib/nexx/documentAccess';

const TURN_LOCK_TTL_MS = 3 * 60 * 1000;
const JOB_LEASE_TTL_MS = 2 * 60 * 1000;
const JOB_RETRY_DELAY_MS = 5_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DOCUMENT_RETRIEVAL_AUDIT_RETENTION_MS = 30 * ONE_DAY_MS;
const DOCUMENT_RETRIEVAL_AUDIT_CLEANUP_BATCH_SIZE = 1000;
const MAX_EXPLICIT_ALIAS_LOOKUP_TERMS = 60;
const MAX_ALIAS_MATCHES_PER_TERM = 8;
const MAX_EXPLICIT_ALIAS_MATCHED_FILES = 50;
const MAX_DOCUMENT_CHUNKS_TO_SCAN_PER_FILE = 300;
const MAX_RETRIEVED_CHUNKS_PER_FILE = 8;

const routeModeValidator = v.union(
    v.literal('adaptive_chat'),
    v.literal('direct_legal_answer'),
    v.literal('local_procedure'),
    v.literal('document_analysis'),
    v.literal('judge_lens_strategy'),
    v.literal('court_ready_drafting'),
    v.literal('pattern_analysis'),
    v.literal('support_grounding'),
    v.literal('safety_escalation')
);

const documentEvidenceSourceValidator = v.object({
    uploadedFileId: v.id('uploadedFiles'),
    filename: v.string(),
    source: v.union(
        v.literal('current_turn'),
        v.literal('conversation_memory'),
        v.literal('case_memory'),
        v.literal('user_private_memory')
    ),
    status: v.string(),
    extractionMethod: v.optional(v.string()),
    contextCharCount: v.optional(v.number()),
    contextTruncated: v.optional(v.boolean()),
});

const turnModeValidator = v.union(v.literal('send'), v.literal('retry'), v.literal('edit'));

const attachmentRefValidator = v.object({
    uploadedFileId: v.id('uploadedFiles'),
    uploadSessionId: v.id('chatUploadSessions'),
    storageId: v.id('_storage'),
    filename: v.string(),
    mimeType: v.string(),
    byteSize: v.number(),
    status: v.union(v.literal('ready'), v.literal('partial')),
});

/** Return the UTC midnight timestamp that anchors daily chat quota windows. */
function utcDayStartMs(now: number) {
    const date = new Date(now);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Treat retryable failures as terminal for this worker attempt.
 * The user can retry by creating a fresh turn, but this specific turn should
 * leave the active-turn list so the composer can recover.
 */
function isTerminalTurnStatus(status: string) {
    return [
        'assistant_saved',
        'degraded_saved',
        'failed_retryable',
        'failed_final',
        'cancelled',
    ].includes(status);
}

/** Build the stable request id used for an assistant message in a turn. */
function assistantRequestId(requestId: string) {
    return `${requestId}-assistant`;
}

const DEGRADED_MESSAGE =
    'I saved your message, but NEXX could not finish the response right now. Please retry this turn in a moment.';
const EMPTY_ARTIFACTS_JSON = JSON.stringify({
    draftReady: null,
    timelineReady: null,
    exhibitReady: null,
    judgeSimulation: null,
    oppositionSimulation: null,
    confidence: null,
});

/** Normalize a ready uploaded file into the context shape consumed by the chat worker. */
function buildUploadedFileContext(
    uploadedFile: Doc<'uploadedFiles'>,
    source: 'current_turn' | DocumentMemorySource,
    uploadSessionId = uploadedFile.uploadSessionId,
    byteSize = uploadedFile.byteSize
) {
    if (!uploadSessionId || (uploadedFile.status !== 'ready' && uploadedFile.status !== 'partial')) {
        return null;
    }

    return {
        uploadedFileId: uploadedFile._id,
        uploadSessionId,
        filename: uploadedFile.filename,
        mimeType: uploadedFile.mimeType,
        byteSize: byteSize ?? 0,
        status: uploadedFile.status,
        source,
        detectedType: uploadedFile.detectedType,
        extractionMethod: uploadedFile.extractionMethod,
        extractionWarnings: uploadedFile.extractionWarnings,
        extractionCharCount: uploadedFile.extractionCharCount,
        chatContextText: uploadedFile.chatContextText,
        chatContextCharCount: uploadedFile.chatContextCharCount,
        contextTruncated: uploadedFile.contextTruncated,
        indexingError: uploadedFile.indexingError,
        extractionError: uploadedFile.extractionError,
    };
}

/** Load the highest-signal chunks for a selected uploaded document and this user turn. */
async function getRelevantDocumentChunkContexts(
    ctx: QueryCtx,
    args: {
        uploadedFileId: Id<'uploadedFiles'>;
        message: string;
        detection: DocumentReferenceDetection;
    }
) {
    const chunks = await ctx.db
        .query('documentChunks')
        .withIndex('by_uploaded_file_chunk', (q) => q.eq('uploadedFileId', args.uploadedFileId))
        .take(MAX_DOCUMENT_CHUNKS_TO_SCAN_PER_FILE);

    return retrieveRelevantDocumentChunks({
        message: args.message,
        detection: args.detection,
        maxChunks: MAX_RETRIEVED_CHUNKS_PER_FILE,
        chunks: chunks.map((chunk) => ({
            chunkId: chunk._id.toString(),
            uploadedFileId: chunk.uploadedFileId.toString(),
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            textLength: chunk.textLength,
            pageStart: chunk.pageStart,
            pageEnd: chunk.pageEnd,
            sectionHeading: chunk.sectionHeading,
            extractionMethod: chunk.extractionMethod,
            ocrConfidence: chunk.ocrConfidence,
            warnings: chunk.warnings,
        })),
    }).map((chunk) => ({
        ...chunk,
        chunkId: chunk.chunkId as Id<'documentChunks'>,
        uploadedFileId: chunk.uploadedFileId as Id<'uploadedFiles'>,
    }));
}

function uniqueRecentUploadedFileIds(ids: Id<'uploadedFiles'>[]) {
    return Array.from(new Set(ids.map((id) => id.toString())))
        .slice(0, 10)
        .map((id) => id as Id<'uploadedFiles'>);
}

function messagePreview(message: string) {
    return message.replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** Preserve existing message metadata when adding structured document source summaries. */
function asMetadataObject(metadata: unknown) {
    return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? metadata as Record<string, unknown>
        : {};
}

/** Parse optional assistant metadata JSON without letting malformed metadata break completion. */
function metadataFromJson(metadataJson?: string) {
    if (!metadataJson) return {};

    try {
        return asMetadataObject(JSON.parse(metadataJson));
    } catch {
        return {};
    }
}

/** Load normalized aliases for a stored document before ranking it for recall. */
async function getDocumentAliases(ctx: QueryCtx, uploadedFileId: Id<'uploadedFiles'>) {
    const aliases = await ctx.db
        .query('documentAliases')
        .withIndex('by_uploaded_file', (q) => q.eq('uploadedFileId', uploadedFileId))
        .collect();
    return aliases.map((alias) => alias.normalizedAlias);
}

function buildExplicitAliasLookupTerms(message: string, detection: DocumentReferenceDetection) {
    const normalizedMessage = normalizeDocumentAlias(message);
    const words = normalizedMessage.split(/\s+/).filter(Boolean);
    const terms = new Set<string>();
    const addTerm = (value: string) => {
        const normalized = normalizeDocumentAlias(value);
        if (normalized.split(/\s+/).filter(Boolean).length >= 2) terms.add(normalized);
    };

    detection.documentHints.forEach(addTerm);
    detection.requestedDocumentTypes.forEach((type) => addTerm(type.replace(/_/g, ' ')));

    for (let wordCount = Math.min(8, words.length); wordCount >= 2; wordCount -= 1) {
        for (let start = 0; start <= words.length - wordCount; start += 1) {
            addTerm(words.slice(start, start + wordCount).join(' '));
            if (terms.size >= MAX_EXPLICIT_ALIAS_LOOKUP_TERMS) return Array.from(terms);
        }
    }

    return Array.from(terms);
}

/** Load explicitly named stored documents that may be older than the normal recency window. */
async function getExplicitAliasMatchedFiles(
    ctx: QueryCtx,
    args: {
        clerkUserId: string;
        caseId?: Id<'cases'>;
        terms: string[];
    }
) {
    const matchedFileIds = new Set<string>();
    const matchedFiles: Doc<'uploadedFiles'>[] = [];
    const addAliasMatches = async (aliases: Doc<'documentAliases'>[]) => {
        for (const alias of aliases) {
            if (matchedFiles.length >= MAX_EXPLICIT_ALIAS_MATCHED_FILES) return;
            const uploadedFileId = alias.uploadedFileId.toString();
            if (matchedFileIds.has(uploadedFileId)) continue;
            const uploadedFile = await ctx.db.get(alias.uploadedFileId);
            if (!uploadedFile) continue;
            matchedFileIds.add(uploadedFileId);
            matchedFiles.push(uploadedFile);
        }
    };

    for (const term of args.terms) {
        if (matchedFiles.length >= MAX_EXPLICIT_ALIAS_MATCHED_FILES) break;
        const userAliases = await ctx.db
            .query('documentAliases')
            .withIndex('by_user_alias', (q) =>
                q.eq('clerkUserId', args.clerkUserId).eq('normalizedAlias', term)
            )
            .take(MAX_ALIAS_MATCHES_PER_TERM);
        await addAliasMatches(userAliases);

        if (matchedFiles.length >= MAX_EXPLICIT_ALIAS_MATCHED_FILES) break;
        if (!args.caseId) continue;
        const caseAliases = await ctx.db
            .query('documentAliases')
            .withIndex('by_case_alias', (q) => q.eq('caseId', args.caseId).eq('normalizedAlias', term))
            .take(MAX_ALIAS_MATCHES_PER_TERM);
        await addAliasMatches(caseAliases);
    }

    return matchedFiles;
}

async function upsertConversationDocumentState(
    ctx: MutationCtx,
    args: {
        conversationId: Id<'conversations'>;
        userId: Id<'users'>;
        uploadedFileIds: Id<'uploadedFiles'>[];
        turnId?: Id<'chatTurns'>;
        now: number;
    }
) {
    if (args.uploadedFileIds.length === 0) return;

    const existing = await ctx.db
        .query('conversationDocumentState')
        .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
        .first();
    const lastReferencedUploadedFileIds = uniqueRecentUploadedFileIds([
        ...args.uploadedFileIds,
        ...(existing?.lastReferencedUploadedFileIds ?? []),
    ]);

    if (existing) {
        await ctx.db.patch(existing._id, {
            activeUploadedFileId: args.uploadedFileIds[0],
            lastReferencedUploadedFileIds,
            lastDocumentAnalysisTurnId: args.turnId ?? existing.lastDocumentAnalysisTurnId,
            lastDocumentReferenceAt: args.now,
            updatedAt: args.now,
        });
        return;
    }

    await ctx.db.insert('conversationDocumentState', {
        conversationId: args.conversationId,
        userId: args.userId,
        activeUploadedFileId: args.uploadedFileIds[0],
        lastReferencedUploadedFileIds,
        pinnedUploadedFileIds: [],
        lastDocumentAnalysisTurnId: args.turnId,
        lastDocumentReferenceAt: args.now,
        createdAt: args.now,
        updatedAt: args.now,
    });
}

/** Consume one chat quota unit after duplicate-turn detection has completed. */
async function consumeTurnRateLimit(
    ctx: MutationCtx,
    userId: Id<'users'>,
    key: string,
    limit: number,
    now: number,
    windowMs = ONE_DAY_MS
) {
    const windowStartMs = utcDayStartMs(now);
    const resetInMs = Math.max(0, windowStartMs + windowMs - now);

    if (limit === -1) {
        return { allowed: true, current: 0, limit, resetInMs };
    }

    if (limit <= 0) {
        return { allowed: false, current: 0, limit, resetInMs };
    }

    const existing = await ctx.db
        .query('chatRateLimitWindows')
        .withIndex('by_user_key', (q) => q.eq('userId', userId).eq('key', key))
        .first();

    if (!existing || existing.windowStartMs !== windowStartMs || existing.windowMs !== windowMs) {
        const count = 1;
        if (existing) {
            await ctx.db.patch(existing._id, {
                windowStartMs,
                windowMs,
                count,
                limit,
                updatedAt: now,
            });
        } else {
            await ctx.db.insert('chatRateLimitWindows', {
                userId,
                key,
                windowStartMs,
                windowMs,
                count,
                limit,
                createdAt: now,
                updatedAt: now,
            });
        }

        return { allowed: true, current: count, limit, resetInMs };
    }

    if (existing.count >= limit) {
        return { allowed: false, current: existing.count, limit, resetInMs };
    }

    const count = existing.count + 1;
    await ctx.db.patch(existing._id, {
        count,
        limit,
        updatedAt: now,
    });

    return { allowed: true, current: count, limit, resetInMs };
}

/** Save a durable degraded assistant message when generation cannot complete. */
async function saveDegradedAssistantForTurn(
    ctx: MutationCtx,
    turn: Doc<'chatTurns'>,
    now: number,
    errorCode: string,
    errorMessage: string
) {
    const metadata = {
        degraded: true,
        errorCode,
        errorMessage,
    };
    let assistantMessageId = turn.assistantMessageId;
    let shouldIncrementMessageCount = false;

    if (assistantMessageId) {
        await ctx.db.patch(assistantMessageId, {
            content: DEGRADED_MESSAGE,
            status: 'degraded',
            artifactsJson: EMPTY_ARTIFACTS_JSON,
            metadata,
            updatedAt: now,
        });
    } else if (turn.assistantDraftMessageId) {
        assistantMessageId = turn.assistantDraftMessageId;
        shouldIncrementMessageCount = true;
        await ctx.db.patch(turn.assistantDraftMessageId, {
            content: DEGRADED_MESSAGE,
            status: 'degraded',
            artifactsJson: EMPTY_ARTIFACTS_JSON,
            requestId: assistantRequestId(turn.requestId),
            metadata,
            updatedAt: now,
        });
    } else {
        shouldIncrementMessageCount = true;
        assistantMessageId = await ctx.db.insert('messages', {
            conversationId: turn.conversationId,
            userId: turn.userId,
            turnId: turn._id,
            role: 'assistant',
            content: DEGRADED_MESSAGE,
            status: 'degraded',
            turnNumber: turn.turnNumber,
            roleOrder: 1,
            version: 1,
            artifactsJson: EMPTY_ARTIFACTS_JSON,
            requestId: assistantRequestId(turn.requestId),
            metadata,
            createdAt: now,
            updatedAt: now,
            mode: turn.routeMode,
        });
    }

    await ctx.db.patch(turn._id, {
        status: 'degraded_saved',
        assistantMessageId,
        assistantDraftMessageId: undefined,
        errorCode,
        errorMessage,
        errorRetryable: true,
        completedAt: now,
        updatedAt: now,
    });

    const conversation = await ctx.db.get(turn.conversationId);
    if (conversation) {
        await ctx.db.patch(turn.conversationId, {
            activeTurnRequestId: conversation.activeTurnRequestId === turn.requestId ? undefined : conversation.activeTurnRequestId,
            activeTurnStartedAt: conversation.activeTurnRequestId === turn.requestId ? undefined : conversation.activeTurnStartedAt,
            lastMessageAt: now,
            messageCount: shouldIncrementMessageCount
                ? (conversation.messageCount ?? 0) + 1
                : conversation.messageCount,
        });
    }

    return assistantMessageId;
}

/** Admit a user turn once, create its generation job, and skip duplicates safely. */
export const acceptChatTurn = mutation({
    args: {
        conversationId: v.id('conversations'),
        requestId: v.string(),
        message: v.string(),
        mode: v.optional(turnModeValidator),
        routeMode: v.optional(routeModeValidator),
        model: v.optional(v.string()),
        temperature: v.optional(v.number()),
        userContextJson: v.optional(v.string()),
        persistUserMessage: v.optional(v.boolean()),
        retryOfAssistantMessageId: v.optional(v.id('messages')),
        editOfUserMessageId: v.optional(v.id('messages')),
        rateLimitKey: v.optional(v.string()),
        rateLimit: v.optional(v.number()),
        rateLimitWindowMs: v.optional(v.number()),
        attachments: v.optional(v.array(attachmentRefValidator)),
    },
    handler: async (ctx, args) => {
        const { user, conversation } = await getAuthenticatedUserAndConversation(ctx, args.conversationId);
        if (!user.clerkId) throw new Error('Authenticated user is missing clerkId');
        const now = Date.now();
        const attachments = args.attachments ?? [];
        const validatedAttachments = [];

        for (const attachment of attachments) {
            const uploadedFile = await ctx.db.get(attachment.uploadedFileId);
            if (
                !uploadedFile ||
                uploadedFile.clerkUserId !== user.clerkId ||
                uploadedFile.conversationId !== args.conversationId ||
                uploadedFile.uploadSessionId !== attachment.uploadSessionId ||
                uploadedFile.storageId !== attachment.storageId ||
                (uploadedFile.status !== 'ready' && uploadedFile.status !== 'partial')
            ) {
                throw new Error('Attachment is not ready or does not belong to this conversation.');
            }
            validatedAttachments.push({
                uploadedFileId: uploadedFile._id,
                uploadSessionId: uploadedFile.uploadSessionId,
                storageId: uploadedFile.storageId,
                filename: uploadedFile.filename,
                mimeType: uploadedFile.mimeType,
                byteSize: uploadedFile.byteSize ?? attachment.byteSize,
                status: uploadedFile.status as 'ready' | 'partial',
            });
        }

        const existingTurn = await ctx.db
            .query('chatTurns')
            .withIndex('by_request', (q) =>
                q.eq('conversationId', args.conversationId).eq('requestId', args.requestId)
            )
            .first();

        if (existingTurn) {
            const existingJob = await ctx.db
                .query('chatGenerationJobs')
                .withIndex('by_turn', (q) => q.eq('turnId', existingTurn._id))
                .first();

            return {
                accepted: true,
                duplicate: true,
                turnId: existingTurn._id,
                jobId: existingJob?._id ?? null,
                status: existingTurn.status,
                userMessageId: existingTurn.userMessageId ?? null,
                assistantMessageId: existingTurn.assistantMessageId ?? null,
            };
        }

        if (args.rateLimitKey && args.rateLimit !== undefined) {
            const rateLimit = await consumeTurnRateLimit(
                ctx,
                user._id,
                args.rateLimitKey,
                args.rateLimit,
                now,
                args.rateLimitWindowMs
            );

            if (!rateLimit.allowed) {
                return {
                    accepted: false,
                    duplicate: false,
                    rateLimited: true,
                    rateLimit,
                    turnId: null,
                    jobId: null,
                    status: 'rate_limited',
                    userMessageId: null,
                    assistantMessageId: null,
                };
            }
        }

        const turnNumber = conversation.nextTurnNumber ?? (conversation.messageCount ?? 0) + 1;
        const shouldPersistUserMessage = args.persistUserMessage !== false;

        const turnId = await ctx.db.insert('chatTurns', {
            conversationId: args.conversationId,
            userId: user._id,
            requestId: args.requestId,
            message: args.message,
            turnNumber,
            mode: args.mode ?? 'send',
            status: 'accepted',
            routeMode: args.routeMode,
            retryOfAssistantMessageId: args.retryOfAssistantMessageId,
            editOfUserMessageId: args.editOfUserMessageId,
            attempt: 0,
            maxAttempts: 3,
            provider: 'openai',
            model: args.model,
            temperature: args.temperature,
            userContextJson: args.userContextJson,
            attachmentRefsJson: validatedAttachments.length > 0 ? JSON.stringify(validatedAttachments) : undefined,
            createdAt: now,
            updatedAt: now,
        });

        let userMessageId: Id<'messages'> | undefined;
        if (shouldPersistUserMessage) {
            userMessageId = await ctx.db.insert('messages', {
                conversationId: args.conversationId,
                userId: user._id,
                turnId,
                role: 'user',
                content: args.message,
                status: 'committed',
                turnNumber,
                roleOrder: 0,
                version: 1,
                metadata: {
                    requestId: args.requestId,
                    attachments: validatedAttachments.map((attachment) => ({
                        uploadedFileId: attachment.uploadedFileId,
                        uploadSessionId: attachment.uploadSessionId,
                        filename: attachment.filename,
                        mimeType: attachment.mimeType,
                        byteSize: attachment.byteSize,
                        status: attachment.status,
                    })),
                },
                requestId: `${args.requestId}-user`,
                createdAt: now,
                updatedAt: now,
                mode: args.routeMode,
            });

            for (const attachment of validatedAttachments) {
                await ctx.db.insert('messageAttachments', {
                    messageId: userMessageId,
                    turnId,
                    conversationId: args.conversationId,
                    uploadedFileId: attachment.uploadedFileId,
                    uploadSessionId: attachment.uploadSessionId,
                    filename: attachment.filename,
                    mimeType: attachment.mimeType,
                    byteSize: attachment.byteSize,
                    status: attachment.status,
                    createdAt: now,
                });
            }
        }

        await upsertConversationDocumentState(ctx, {
            conversationId: args.conversationId,
            userId: user._id,
            uploadedFileIds: validatedAttachments.map((attachment) => attachment.uploadedFileId),
            turnId,
            now,
        });

        const jobId = await ctx.db.insert('chatGenerationJobs', {
            turnId,
            conversationId: args.conversationId,
            userId: user._id,
            requestId: args.requestId,
            status: 'queued',
            attempt: 0,
            maxAttempts: 3,
            createdAt: now,
            updatedAt: now,
        });

        await ctx.db.patch(turnId, {
            status: shouldPersistUserMessage ? 'user_saved' : 'queued',
            userMessageId,
            updatedAt: now,
        });

        await ctx.db.patch(args.conversationId, {
            nextTurnNumber: turnNumber + 1,
            lastMessageAt: now,
            messageCount: (conversation.messageCount ?? 0) + (shouldPersistUserMessage ? 1 : 0),
            routeMode: args.routeMode,
        });

        await ctx.scheduler.runAfter(0, internal.chatWorker.processChatGenerationJob, { jobId });

        return {
            accepted: true,
            duplicate: false,
            turnId,
            jobId,
            status: shouldPersistUserMessage ? 'user_saved' : 'queued',
            userMessageId: userMessageId ?? null,
            assistantMessageId: null,
        };
    },
});

/** List non-terminal turns so the client can show generation state. */
export const activeForConversation = query({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, args) => {
        const { conversation } = await getAuthenticatedUserAndConversation(ctx, args.conversationId);
        const recent = await ctx.db
            .query('chatTurns')
            .withIndex('by_conversation', (q) => q.eq('conversationId', conversation._id))
            .order('desc')
            .take(10);

        return recent
            .filter((turn) => !isTerminalTurnStatus(turn.status))
            .sort((a, b) => a.turnNumber - b.turnNumber);
    },
});

/** Record that the client observed a turn update. */
export const acknowledgeTurn = mutation({
    args: { turnId: v.id('chatTurns') },
    handler: async (ctx, args) => {
        const turn = await ctx.db.get(args.turnId);
        if (!turn) return null;
        await getAuthenticatedUserAndConversation(ctx, turn.conversationId);
        await ctx.db.patch(args.turnId, {
            clientAckedAt: Date.now(),
            updatedAt: Date.now(),
        });
        return true;
    },
});

/** Lease one queued generation job while respecting per-conversation ordering. */
export const leaseGenerationJob = internalMutation({
    args: {
        jobId: v.id('chatGenerationJobs'),
        leaseOwner: v.string(),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const job = await ctx.db.get(args.jobId);
        if (!job) return { status: 'missing' as const };

        if (job.status === 'completed' || job.status === 'failed_final' || job.status === 'cancelled') {
            return { status: 'terminal' as const, turnId: job.turnId };
        }

        if (job.leaseAvailableAt && job.leaseAvailableAt > now) {
            await ctx.scheduler.runAfter(job.leaseAvailableAt - now, internal.chatWorker.processChatGenerationJob, {
                jobId: args.jobId,
            });
            return { status: 'not_ready' as const, turnId: job.turnId };
        }

        const turn = await ctx.db.get(job.turnId);
        const conversation = await ctx.db.get(job.conversationId);
        if (!turn || !conversation) {
            await ctx.db.patch(args.jobId, {
                status: 'failed_final',
                errorCode: 'missing_turn_or_conversation',
                updatedAt: now,
                completedAt: now,
            });
            return { status: 'missing_context' as const };
        }

        const activeRequestId = conversation.activeTurnRequestId;
        const activeStartedAt = conversation.activeTurnStartedAt ?? 0;
        const activeIsFresh = activeRequestId && activeRequestId !== job.requestId && now - activeStartedAt < TURN_LOCK_TTL_MS;

        if (activeIsFresh) {
            await ctx.db.patch(args.jobId, {
                status: 'queued',
                leaseAvailableAt: now + JOB_RETRY_DELAY_MS,
                updatedAt: now,
            });
            await ctx.db.patch(job.turnId, {
                status: 'queued',
                updatedAt: now,
            });
            await ctx.scheduler.runAfter(JOB_RETRY_DELAY_MS, internal.chatWorker.processChatGenerationJob, {
                jobId: args.jobId,
            });
            return { status: 'conversation_busy' as const, turnId: job.turnId };
        }

        await ctx.db.patch(job.conversationId, {
            activeTurnRequestId: job.requestId,
            activeTurnStartedAt: now,
        });
        await ctx.db.patch(args.jobId, {
            status: 'running',
            leaseOwner: args.leaseOwner,
            leaseExpiresAt: now + JOB_LEASE_TTL_MS,
            startedAt: job.startedAt ?? now,
            updatedAt: now,
        });
        await ctx.db.patch(job.turnId, {
            status: 'generating',
            startedAt: turn.startedAt ?? now,
            updatedAt: now,
        });

        return { status: 'leased' as const, turnId: job.turnId };
    },
});

/** Load the prompt context needed by the worker for a specific turn. */
export const getGenerationContext = internalQuery({
    args: { turnId: v.id('chatTurns') },
    handler: async (ctx, args) => {
        const turn = await ctx.db.get(args.turnId);
        if (!turn) return null;

        const [conversation, user, summaryDoc, caseGraphDoc] = await Promise.all([
            ctx.db.get(turn.conversationId),
            ctx.db.get(turn.userId),
            ctx.db
                .query('conversationSummaries')
                .withIndex('by_conversationId', (q) => q.eq('conversationId', turn.conversationId))
                .first(),
            ctx.db
                .query('caseGraphs')
                .withIndex('by_userId', (q) => q.eq('userId', turn.userId))
                .first(),
        ]);

        const recentMessages = await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) => q.eq('conversationId', turn.conversationId))
            .order('desc')
            .take(40);

        recentMessages.sort((a, b) => {
            const aTurn = a.turnNumber ?? 0;
            const bTurn = b.turnNumber ?? 0;
            if (aTurn !== bTurn) return aTurn - bTurn;
            const aRole = a.roleOrder ?? (a.role === 'user' ? 0 : 1);
            const bRole = b.roleOrder ?? (b.role === 'user' ? 0 : 1);
            if (aRole !== bRole) return aRole - bRole;
            return a.createdAt - b.createdAt;
        });

        const documentReference = detectDocumentReference(turn.message);
        const attachmentRows = await ctx.db
            .query('messageAttachments')
            .withIndex('by_turn', (q) => q.eq('turnId', turn._id))
            .collect();
        const attachmentContexts = [];
        for (const attachment of attachmentRows) {
            const uploadedFile = await ctx.db.get(attachment.uploadedFileId);
            if (!uploadedFile) continue;
            const context = buildUploadedFileContext(
                uploadedFile,
                'current_turn',
                attachment.uploadSessionId,
                uploadedFile.byteSize ?? attachment.byteSize
            );
            if (context) {
                attachmentContexts.push({
                    ...context,
                    documentChunks: await getRelevantDocumentChunkContexts(ctx, {
                        uploadedFileId: uploadedFile._id,
                        message: turn.message,
                        detection: documentReference,
                    }),
                });
            }
        }

        const currentAttachmentIds = new Set(attachmentContexts.map((attachment) => attachment.uploadedFileId));
        const documentState = await ctx.db
            .query('conversationDocumentState')
            .withIndex('by_conversation', (q) => q.eq('conversationId', turn.conversationId))
            .first();
        const rememberedFileIds = uniqueRecentUploadedFileIds([
            ...(documentState?.activeUploadedFileId ? [documentState.activeUploadedFileId] : []),
            ...(documentState?.lastReferencedUploadedFileIds ?? []),
        ]);
        const rememberedUploadedFiles: Doc<'uploadedFiles'>[] = [];
        for (const uploadedFileId of rememberedFileIds) {
            const uploadedFile = await ctx.db.get(uploadedFileId);
            if (
                uploadedFile &&
                uploadedFile.clerkUserId === user?.clerkId
            ) {
                rememberedUploadedFiles.push(uploadedFile);
            }
        }
        const clerkUserId = user?.clerkId;
        const activeCaseId = conversation?.caseId;
        const aliasLookupTerms = documentReference.referencesDocument
            ? buildExplicitAliasLookupTerms(turn.message, documentReference)
            : [];
        const [
            conversationUploadedFiles,
            caseUploadedFiles,
            userPrivateUploadedFiles,
            explicitAliasMatchedFiles,
        ] = await Promise.all([
            ctx.db
                .query('uploadedFiles')
                .withIndex('by_conversationId', (q) => q.eq('conversationId', turn.conversationId))
                .order('desc')
                .take(25),
            clerkUserId && activeCaseId
                ? ctx.db
                    .query('uploadedFiles')
                    .withIndex('by_clerk_case', (q) =>
                        q.eq('clerkUserId', clerkUserId).eq('caseId', activeCaseId)
                    )
                    .order('desc')
                    .take(25)
                : Promise.resolve([] as Doc<'uploadedFiles'>[]),
            clerkUserId
                ? ctx.db
                    .query('uploadedFiles')
                    .withIndex('by_clerk_private_scope', (q) =>
                        q.eq('clerkUserId', clerkUserId).eq('conversationId', undefined).eq('caseId', undefined)
                    )
                    .order('desc')
                    .take(25)
                : Promise.resolve([] as Doc<'uploadedFiles'>[]),
            clerkUserId && aliasLookupTerms.length > 0
                ? getExplicitAliasMatchedFiles(ctx, {
                    clerkUserId,
                    caseId: activeCaseId,
                    terms: aliasLookupTerms,
                })
                : Promise.resolve([] as Doc<'uploadedFiles'>[]),
        ]);
        const candidateMemoryFiles = [
            ...rememberedUploadedFiles,
            ...explicitAliasMatchedFiles,
            ...conversationUploadedFiles.filter((uploadedFile) =>
                !rememberedUploadedFiles.some((remembered) => remembered._id === uploadedFile._id)
            ),
            ...caseUploadedFiles,
            ...userPrivateUploadedFiles,
        ].filter((uploadedFile) => !currentAttachmentIds.has(uploadedFile._id));
        const accessScope = clerkUserId
            ? {
                clerkUserId,
                conversationId: turn.conversationId.toString(),
                caseId: activeCaseId?.toString(),
            }
            : null;
        const memorySourceByUploadedFileId = new Map<string, DocumentMemorySource>();
        const seenCandidateFileIds = new Set<string>();
        const accessibleMemoryFiles: Doc<'uploadedFiles'>[] = [];
        for (const uploadedFile of candidateMemoryFiles) {
            const uploadedFileId = uploadedFile._id.toString();
            if (seenCandidateFileIds.has(uploadedFileId) || !accessScope) continue;
            seenCandidateFileIds.add(uploadedFileId);
            if (!canUseDocumentMemoryCandidate({
                uploadedFileId,
                clerkUserId: uploadedFile.clerkUserId,
                conversationId: uploadedFile.conversationId?.toString(),
                caseId: uploadedFile.caseId?.toString(),
                status: uploadedFile.status,
                chatContextText: uploadedFile.chatContextText,
            }, accessScope)) {
                continue;
            }
            const source = resolveDocumentMemorySource({
                uploadedFileId,
                clerkUserId: uploadedFile.clerkUserId,
                conversationId: uploadedFile.conversationId?.toString(),
                caseId: uploadedFile.caseId?.toString(),
            }, accessScope);
            if (!source) continue;
            memorySourceByUploadedFileId.set(uploadedFileId, source);
            accessibleMemoryFiles.push(uploadedFile);
        }
        const rankableMemoryFiles = accessibleMemoryFiles.filter((uploadedFile) => {
            const source = memorySourceByUploadedFileId.get(uploadedFile._id.toString());
            return source ? Boolean(buildUploadedFileContext(uploadedFile, source)?.chatContextText?.trim()) : false;
        });

        const aliasesByUploadedFileId = new Map<string, string[]>();
        const aliasPairs = await Promise.all(
            rankableMemoryFiles.map(async (uploadedFile) => [
                uploadedFile._id.toString(),
                await getDocumentAliases(ctx, uploadedFile._id),
            ] as const)
        );
        for (const [uploadedFileId, aliases] of aliasPairs) {
            aliasesByUploadedFileId.set(uploadedFileId, aliases);
        }

        const recentReferenceRankById = new Map(
            rememberedFileIds.map((uploadedFileId, index) => [uploadedFileId.toString(), index])
        );
        const storedDocumentCandidateInputs = rankableMemoryFiles.map((uploadedFile) => ({
            uploadedFileId: uploadedFile._id.toString(),
            filename: uploadedFile.filename,
            createdAt: uploadedFile.createdAt,
            detectedType: uploadedFile.detectedType,
            aliases: aliasesByUploadedFileId.get(uploadedFile._id.toString()) ?? [],
            memorySource: memorySourceByUploadedFileId.get(uploadedFile._id.toString()),
            isActiveDocument: documentState?.activeUploadedFileId?.toString() === uploadedFile._id.toString(),
            recentReferenceRank: recentReferenceRankById.get(uploadedFile._id.toString()),
        }));
        const selectedStoredDocuments = selectStoredDocumentCandidates({
            message: turn.message,
            detection: documentReference,
            maxDocuments: 5,
            candidates: storedDocumentCandidateInputs,
        });
        const documentAmbiguity = attachmentContexts.length === 0
            ? detectStoredDocumentAmbiguity({
                detection: documentReference,
                ranked: selectedStoredDocuments.ranked,
                candidates: storedDocumentCandidateInputs,
            })
            : null;
        const rankedStoredDocumentIds = selectedStoredDocuments.selected.map((selection) => selection.uploadedFileId);
        const conversationMemoryFiles = rankedStoredDocumentIds
            .map((uploadedFileId) => rankableMemoryFiles.find((candidate) => candidate._id.toString() === uploadedFileId))
            .filter((uploadedFile): uploadedFile is Doc<'uploadedFiles'> => Boolean(uploadedFile));

        const availableDocumentContexts = [];
        for (const uploadedFile of conversationMemoryFiles) {
            const source = memorySourceByUploadedFileId.get(uploadedFile._id.toString()) ?? 'conversation_memory';
            const context = buildUploadedFileContext(uploadedFile, source);
            if (context?.chatContextText?.trim()) {
                availableDocumentContexts.push({
                    ...context,
                    documentChunks: await getRelevantDocumentChunkContexts(ctx, {
                        uploadedFileId: uploadedFile._id,
                        message: turn.message,
                        detection: documentReference,
                    }),
                });
            }
        }

        return {
            turn,
            conversation,
            user,
            summaryDoc,
            caseGraphDoc,
            conversationDocumentState: documentState,
            documentAmbiguity,
            attachmentContexts,
            availableDocumentContexts,
            recentMessages: recentMessages.filter((m) => m.status !== 'deleted'),
        };
    },
});

export const recordDocumentRetrievalAudit = internalMutation({
    args: {
        turnId: v.id('chatTurns'),
        detectionResultJson: v.string(),
        candidateUploadedFileIds: v.array(v.id('uploadedFiles')),
        selectedUploadedFileIds: v.array(v.id('uploadedFiles')),
        selectedChunkIds: v.optional(v.array(v.id('documentChunks'))),
        selectedContextCount: v.number(),
        retrievalReason: v.union(
            v.literal('current_turn_attachment'),
            v.literal('active_document'),
            v.literal('recent_reference'),
            v.literal('conversation_memory'),
            v.literal('case_memory'),
            v.literal('user_private_memory'),
            v.literal('document_analysis_route'),
            v.literal('ambiguous_document_selection')
        ),
    },
    handler: async (ctx, args) => {
        const turn = await ctx.db.get(args.turnId);
        if (!turn) return null;
        const [conversation, user] = await Promise.all([
            ctx.db.get(turn.conversationId),
            ctx.db.get(turn.userId),
        ]);
        if (!conversation || !user) return null;
        const now = Date.now();

        const selectedUploadedFileIds = uniqueRecentUploadedFileIds(args.selectedUploadedFileIds);
        const candidateUploadedFileIds = uniqueRecentUploadedFileIds(args.candidateUploadedFileIds);
        const selectedChunkIds = args.selectedChunkIds
            ? Array.from(new Set(args.selectedChunkIds.map((id) => id.toString())))
                .slice(0, 50)
                .map((id) => id as Id<'documentChunks'>)
            : undefined;

        await ctx.db.insert('documentRetrievalAudit', {
            conversationId: turn.conversationId,
            userId: turn.userId,
            caseId: conversation.caseId,
            turnId: turn._id,
            messagePreview: messagePreview(turn.message),
            detectionResultJson: args.detectionResultJson,
            candidateUploadedFileIds,
            selectedUploadedFileIds,
            selectedChunkIds,
            selectedContextCount: args.selectedContextCount,
            retrievalReason: args.retrievalReason,
            createdAt: now,
            expiresAt: now + DOCUMENT_RETRIEVAL_AUDIT_RETENTION_MS,
        });

        await upsertConversationDocumentState(ctx, {
            conversationId: turn.conversationId,
            userId: turn.userId,
            uploadedFileIds: selectedUploadedFileIds,
            turnId: turn._id,
            now,
        });

        return true;
    },
});

export const recordDocumentAnswerEvidence = internalMutation({
    args: {
        turnId: v.id('chatTurns'),
        assistantMessageId: v.id('messages'),
        sources: v.array(documentEvidenceSourceValidator),
        usedChunkIds: v.optional(v.array(v.id('documentChunks'))),
    },
    handler: async (ctx, args) => {
        const turn = await ctx.db.get(args.turnId);
        const assistantMessage = await ctx.db.get(args.assistantMessageId);
        if (
            !turn ||
            !assistantMessage ||
            assistantMessage.turnId !== turn._id ||
            assistantMessage.conversationId !== turn.conversationId ||
            turn.assistantMessageId !== assistantMessage._id ||
            assistantMessage.role !== 'assistant'
        ) {
            return null;
        }

        const [conversation, user] = await Promise.all([
            ctx.db.get(turn.conversationId),
            ctx.db.get(turn.userId),
        ]);
        if (!conversation || !user?.clerkId) return null;

        const seenUploadedFileIds = new Set<string>();
        const verifiedSources = [];
        for (const source of args.sources) {
            const uploadedFileId = source.uploadedFileId.toString();
            if (seenUploadedFileIds.has(uploadedFileId)) continue;
            const uploadedFile = await ctx.db.get(source.uploadedFileId);
            if (
                !uploadedFile ||
                uploadedFile.clerkUserId !== user.clerkId ||
                (uploadedFile.status !== 'ready' && uploadedFile.status !== 'partial')
            ) {
                continue;
            }
            if (
                source.source === 'current_turn' &&
                !(await ctx.db
                    .query('messageAttachments')
                    .withIndex('by_turn', (q) => q.eq('turnId', turn._id))
                    .filter((q) => q.eq(q.field('uploadedFileId'), uploadedFile._id))
                    .first())
            ) {
                continue;
            }
            if (source.source === 'conversation_memory' && uploadedFile.conversationId !== turn.conversationId) {
                continue;
            }
            if (source.source === 'case_memory' && (!conversation.caseId || uploadedFile.caseId !== conversation.caseId)) {
                continue;
            }
            if (source.source === 'user_private_memory' && (uploadedFile.conversationId || uploadedFile.caseId)) {
                continue;
            }

            seenUploadedFileIds.add(uploadedFileId);
            verifiedSources.push({
                uploadedFileId: uploadedFile._id,
                filename: uploadedFile.filename,
                source: source.source,
                status: uploadedFile.status,
                extractionMethod: uploadedFile.extractionMethod,
                contextCharCount: source.contextCharCount ?? uploadedFile.chatContextCharCount,
                contextTruncated: source.contextTruncated ?? uploadedFile.contextTruncated,
            });
        }

        if (verifiedSources.length === 0) return null;

        const now = Date.now();
        const usedUploadedFileIds = verifiedSources.map((source) => source.uploadedFileId);
        const allowedUploadedFileIds = new Set(usedUploadedFileIds.map((id) => id.toString()));
        const usedChunkIds: Id<'documentChunks'>[] = [];
        const seenChunkIds = new Set<string>();
        for (const chunkId of args.usedChunkIds ?? []) {
            const chunkIdString = chunkId.toString();
            if (seenChunkIds.has(chunkIdString) || seenChunkIds.size >= 50) continue;
            const chunk = await ctx.db.get(chunkId);
            if (
                !chunk ||
                chunk.clerkUserId !== user.clerkId ||
                !allowedUploadedFileIds.has(chunk.uploadedFileId.toString())
            ) {
                continue;
            }
            seenChunkIds.add(chunkIdString);
            usedChunkIds.push(chunk._id);
        }
        const existing = await ctx.db
            .query('documentAnswerEvidence')
            .withIndex('by_turn', (q) => q.eq('turnId', turn._id))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                assistantMessageId: assistantMessage._id,
                usedUploadedFileIds,
                usedChunkIds,
                sources: verifiedSources,
                updatedAt: now,
            });
        } else {
            await ctx.db.insert('documentAnswerEvidence', {
                conversationId: turn.conversationId,
                userId: turn.userId,
                caseId: conversation.caseId,
                turnId: turn._id,
                assistantMessageId: assistantMessage._id,
                usedUploadedFileIds,
                usedChunkIds,
                sources: verifiedSources,
                createdAt: now,
                updatedAt: now,
            });
        }

        await ctx.db.patch(assistantMessage._id, {
            metadata: {
                ...asMetadataObject(assistantMessage.metadata),
                documentSources: verifiedSources.map((source) => ({
                    uploadedFileId: source.uploadedFileId.toString(),
                    filename: source.filename,
                    source: source.source,
                    status: source.status,
                    extractionMethod: source.extractionMethod,
                    contextCharCount: source.contextCharCount,
                    contextTruncated: source.contextTruncated,
                })),
                usedUploadedFileIds: usedUploadedFileIds.map((uploadedFileId) => uploadedFileId.toString()),
                usedDocumentChunkIds: usedChunkIds.map((chunkId) => chunkId.toString()),
            },
            updatedAt: now,
        });

        return { sourceCount: verifiedSources.length };
    },
});

export const deleteExpiredDocumentRetrievalAudits = internalMutation({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();
        const expired = await ctx.db
            .query('documentRetrievalAudit')
            .withIndex('by_expiresAt')
            .filter((q) => q.lt(q.field('expiresAt'), now))
            .take(DOCUMENT_RETRIEVAL_AUDIT_CLEANUP_BATCH_SIZE);

        for (const audit of expired) {
            await ctx.db.delete(audit._id);
        }

        if (expired.length === DOCUMENT_RETRIEVAL_AUDIT_CLEANUP_BATCH_SIZE) {
            await ctx.scheduler.runAfter(0, internal.chatTurns.deleteExpiredDocumentRetrievalAudits, {});
        }

        return { deleted: expired.length };
    },
});

/** Save or update a draft assistant message while the provider is streaming. */
export const saveAssistantDraft = internalMutation({
    args: {
        jobId: v.id('chatGenerationJobs'),
        leaseOwner: v.string(),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const job = await ctx.db.get(args.jobId);
        if (!job || job.leaseOwner !== args.leaseOwner || job.status !== 'running') return null;

        const turn = await ctx.db.get(job.turnId);
        if (!turn) return null;

        if (turn.assistantDraftMessageId) {
            await ctx.db.patch(turn.assistantDraftMessageId, {
                content: args.content,
                updatedAt: now,
            });
        } else {
            const draftId = await ctx.db.insert('messages', {
                conversationId: turn.conversationId,
                userId: turn.userId,
                turnId: turn._id,
                role: 'assistant',
                content: args.content,
                status: 'draft',
                turnNumber: turn.turnNumber,
                roleOrder: 1,
                version: 1,
                requestId: `${turn.requestId}-assistant-draft`,
                metadata: { draft: true },
                createdAt: now,
                updatedAt: now,
                mode: turn.routeMode,
            });
            await ctx.db.patch(turn._id, {
                assistantDraftMessageId: draftId,
                status: 'assistant_draft_saved',
                updatedAt: now,
            });
        }

        await ctx.db.patch(args.jobId, {
            leaseExpiresAt: now + JOB_LEASE_TTL_MS,
            updatedAt: now,
        });
        return true;
    },
});

/** Finalize a turn with a committed or degraded assistant message. */
export const completeAssistant = internalMutation({
    args: {
        jobId: v.id('chatGenerationJobs'),
        leaseOwner: v.string(),
        content: v.string(),
        artifactsJson: v.optional(v.string()),
        providerResponseId: v.optional(v.string()),
        degraded: v.optional(v.boolean()),
        errorCode: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
        metadataJson: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const job = await ctx.db.get(args.jobId);
        if (!job || job.leaseOwner !== args.leaseOwner) return null;
        const turn = await ctx.db.get(job.turnId);
        if (!turn) return null;

        const messageStatus = args.degraded ? 'degraded' : 'committed';
        const metadata = {
            ...metadataFromJson(args.metadataJson),
            degraded: args.degraded ?? false,
            errorCode: args.errorCode,
            errorMessage: args.errorMessage,
        };
        let assistantMessageId = turn.assistantMessageId;
        let shouldIncrementMessageCount = false;

        if (assistantMessageId) {
            await ctx.db.patch(assistantMessageId, {
                content: args.content,
                status: messageStatus,
                artifactsJson: args.artifactsJson,
                metadata,
                updatedAt: now,
            });
        } else if (turn.assistantDraftMessageId) {
            assistantMessageId = turn.assistantDraftMessageId;
            shouldIncrementMessageCount = true;
            await ctx.db.patch(turn.assistantDraftMessageId, {
                content: args.content,
                status: messageStatus,
                artifactsJson: args.artifactsJson,
                requestId: assistantRequestId(turn.requestId),
                metadata,
                updatedAt: now,
            });
        } else {
            shouldIncrementMessageCount = true;
            assistantMessageId = await ctx.db.insert('messages', {
                conversationId: turn.conversationId,
                userId: turn.userId,
                turnId: turn._id,
                role: 'assistant',
                content: args.content,
                status: messageStatus,
                turnNumber: turn.turnNumber,
                roleOrder: 1,
                version: 1,
                artifactsJson: args.artifactsJson,
                requestId: assistantRequestId(turn.requestId),
                metadata,
                createdAt: now,
                updatedAt: now,
                mode: turn.routeMode,
            });
        }

        await ctx.db.patch(turn._id, {
            status: args.degraded ? 'degraded_saved' : 'assistant_saved',
            assistantMessageId,
            providerResponseId: args.providerResponseId,
            errorCode: args.errorCode,
            errorMessage: args.errorMessage,
            errorRetryable: args.degraded ? true : undefined,
            completedAt: now,
            updatedAt: now,
        });

        await ctx.db.patch(args.jobId, {
            status: 'completed',
            completedAt: now,
            errorCode: args.errorCode,
            errorMessage: args.errorMessage,
            updatedAt: now,
        });

        const conversation = await ctx.db.get(turn.conversationId);
        if (conversation) {
            await ctx.db.patch(turn.conversationId, {
                activeTurnRequestId: conversation.activeTurnRequestId === turn.requestId ? undefined : conversation.activeTurnRequestId,
                activeTurnStartedAt: conversation.activeTurnRequestId === turn.requestId ? undefined : conversation.activeTurnStartedAt,
                openaiLastResponseId: args.providerResponseId ?? conversation.openaiLastResponseId,
                lastMessageAt: now,
                messageCount: shouldIncrementMessageCount
                    ? (conversation.messageCount ?? 0) + 1
                    : conversation.messageCount,
            });
        }

        const nextJob = await ctx.db
            .query('chatGenerationJobs')
            .withIndex('by_conversation_status', (q) =>
                q.eq('conversationId', turn.conversationId).eq('status', 'queued')
            )
            .first();
        if (nextJob) {
            await ctx.scheduler.runAfter(0, internal.chatWorker.processChatGenerationJob, { jobId: nextJob._id });
        }

        return { assistantMessageId };
    },
});

/** Requeue or degrade expired jobs so conversations never stay stuck active. */
export const recoverStaleJobs = internalMutation({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();
        const running = await ctx.db
            .query('chatGenerationJobs')
            .withIndex('by_status', (q) => q.eq('status', 'running'))
            .take(50);

        let recovered = 0;
        for (const job of running) {
            if (!job.leaseExpiresAt || job.leaseExpiresAt > now) continue;
            const turn = await ctx.db.get(job.turnId);
            if (!turn) continue;

            if (job.attempt + 1 < job.maxAttempts) {
                await ctx.db.patch(job._id, {
                    status: 'queued',
                    attempt: job.attempt + 1,
                    leaseOwner: undefined,
                    leaseExpiresAt: undefined,
                    leaseAvailableAt: now + JOB_RETRY_DELAY_MS,
                    errorCode: 'job_lease_expired',
                    updatedAt: now,
                });
                await ctx.db.patch(turn._id, {
                    status: 'queued',
                    errorCode: 'job_lease_expired',
                    errorRetryable: true,
                    updatedAt: now,
                });
                await ctx.scheduler.runAfter(JOB_RETRY_DELAY_MS, internal.chatWorker.processChatGenerationJob, {
                    jobId: job._id,
                });
            } else {
                const errorMessage = 'Chat generation worker lease expired before completion.';
                await saveDegradedAssistantForTurn(ctx, turn, now, 'job_lease_expired', errorMessage);
                await ctx.db.patch(job._id, {
                    status: 'failed_final',
                    errorCode: 'job_lease_expired',
                    errorMessage,
                    completedAt: now,
                    updatedAt: now,
                });
            }

            const conversation = await ctx.db.get(job.conversationId);
            if (conversation?.activeTurnRequestId === job.requestId) {
                await ctx.db.patch(job.conversationId, {
                    activeTurnRequestId: undefined,
                    activeTurnStartedAt: undefined,
                });
            }
            recovered++;
        }

        const failedFinal = await ctx.db
            .query('chatGenerationJobs')
            .withIndex('by_status', (q) => q.eq('status', 'failed_final'))
            .take(50);

        for (const job of failedFinal) {
            const turn = await ctx.db.get(job.turnId);
            if (!turn || turn.status === 'assistant_saved' || turn.status === 'degraded_saved' || turn.status === 'cancelled') {
                continue;
            }

            await saveDegradedAssistantForTurn(
                ctx,
                turn,
                now,
                job.errorCode ?? 'chat_generation_failed',
                job.errorMessage ?? 'Chat generation failed before completion.'
            );
            recovered++;
        }

        return { recovered };
    },
});
