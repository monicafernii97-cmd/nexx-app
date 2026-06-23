import { internalMutation, internalQuery, mutation, query, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { getAuthenticatedUserAndConversation } from './lib/auth';

const TURN_LOCK_TTL_MS = 3 * 60 * 1000;
const JOB_LEASE_TTL_MS = 2 * 60 * 1000;
const JOB_RETRY_DELAY_MS = 5_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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

        const attachmentRows = await ctx.db
            .query('messageAttachments')
            .withIndex('by_turn', (q) => q.eq('turnId', turn._id))
            .collect();
        const attachmentContexts = [];
        for (const attachment of attachmentRows) {
            const uploadedFile = await ctx.db.get(attachment.uploadedFileId);
            if (!uploadedFile || (uploadedFile.status !== 'ready' && uploadedFile.status !== 'partial')) continue;
            attachmentContexts.push({
                uploadedFileId: uploadedFile._id,
                uploadSessionId: attachment.uploadSessionId,
                filename: uploadedFile.filename,
                mimeType: uploadedFile.mimeType,
                byteSize: uploadedFile.byteSize ?? attachment.byteSize,
                status: uploadedFile.status,
                detectedType: uploadedFile.detectedType,
                extractionMethod: uploadedFile.extractionMethod,
                extractionWarnings: uploadedFile.extractionWarnings,
                extractionCharCount: uploadedFile.extractionCharCount,
                chatContextText: uploadedFile.chatContextText,
                chatContextCharCount: uploadedFile.chatContextCharCount,
                contextTruncated: uploadedFile.contextTruncated,
                indexingError: uploadedFile.indexingError,
                extractionError: uploadedFile.extractionError,
            });
        }

        return {
            turn,
            conversation,
            user,
            summaryDoc,
            caseGraphDoc,
            attachmentContexts,
            recentMessages: recentMessages.filter((m) => m.status !== 'deleted'),
        };
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
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const job = await ctx.db.get(args.jobId);
        if (!job || job.leaseOwner !== args.leaseOwner) return null;
        const turn = await ctx.db.get(job.turnId);
        if (!turn) return null;

        const messageStatus = args.degraded ? 'degraded' : 'committed';
        let assistantMessageId = turn.assistantMessageId;
        let shouldIncrementMessageCount = false;

        if (assistantMessageId) {
            await ctx.db.patch(assistantMessageId, {
                content: args.content,
                status: messageStatus,
                artifactsJson: args.artifactsJson,
                metadata: {
                    degraded: args.degraded ?? false,
                    errorCode: args.errorCode,
                    errorMessage: args.errorMessage,
                },
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
                metadata: {
                    degraded: args.degraded ?? false,
                    errorCode: args.errorCode,
                    errorMessage: args.errorMessage,
                },
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
                metadata: {
                    degraded: args.degraded ?? false,
                    errorCode: args.errorCode,
                    errorMessage: args.errorMessage,
                },
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
