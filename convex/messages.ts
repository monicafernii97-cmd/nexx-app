import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUserAndConversation } from './lib/auth';
import { routeModeValidator } from './lib/routeModeValidator';

function isLegacyClientFailureMessage(msg: { role: 'user' | 'assistant'; content: string }) {
    if (msg.role !== 'assistant') return false;

    const normalized = msg.content.toLowerCase();
    return (
        normalized.includes("i apologize, but i'm unable to process this right now") &&
        normalized.includes('connection issue') &&
        normalized.includes('your data remains secure')
    );
}

function asMetadataObject(metadata: unknown) {
    return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? metadata as Record<string, unknown>
        : {};
}

function pageLabel(pageStart?: number, pageEnd?: number) {
    if (pageStart === undefined || pageStart === null) return undefined;
    return pageEnd !== undefined && pageEnd !== null && pageEnd !== pageStart
        ? `pp. ${pageStart}-${pageEnd}`
        : `p. ${pageStart}`;
}

function quotePreview(value: string) {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 280) return normalized;
    return `${normalized.slice(0, 277).trim()}...`;
}

/** ── Mutations ── */

/**
 * Send a message — auth-guarded.
 * Accepts an optional `requestId` for idempotent persistence: if a message
 * with the same requestId already exists in the conversation, its ID is
 * returned without inserting a duplicate.
 */
export const send = mutation({
    args: {
        conversationId: v.id('conversations'),
        role: v.union(v.literal('user'), v.literal('assistant')),
        content: v.string(),
        metadata: v.optional(v.any()),
        requestId: v.optional(v.string()),
        artifactsJson: v.optional(v.string()),
        mode: v.optional(routeModeValidator),
    },
    handler: async (ctx, args) => {
        await getAuthenticatedUserAndConversation(ctx, args.conversationId);

        if (isLegacyClientFailureMessage(args)) {
            return null;
        }

        // Idempotency: use compound index for efficient lookup
        if (args.requestId) {
            const existing = await ctx.db
                .query('messages')
                .withIndex('by_conversation_requestId', (q) =>
                    q.eq('conversationId', args.conversationId).eq('requestId', args.requestId)
                )
                .first();
            if (existing) return existing._id;
        }

        const messageId = await ctx.db.insert('messages', {
            conversationId: args.conversationId,
            role: args.role,
            content: args.content,
            metadata: args.metadata,
            requestId: args.requestId,
            artifactsJson: args.artifactsJson,
            mode: args.mode,
            createdAt: Date.now(),
        });

        // Update conversation's lastMessageAt and increment messageCount
        const conversation = await ctx.db.get(args.conversationId);
        await ctx.db.patch(args.conversationId, {
            lastMessageAt: Date.now(),
            messageCount: (conversation?.messageCount ?? 0) + 1,
        });

        return messageId;
    },
});

/** Update a user message's content — auth-guarded, only user messages can be edited. */
export const updateContent = mutation({
    args: {
        messageId: v.id('messages'),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        const message = await ctx.db.get(args.messageId);
        if (!message) throw new Error('Message not found');
        if (message.role !== 'user') {
            throw new Error('Only user messages can be edited');
        }

        // Auth check: verify ownership
        await getAuthenticatedUserAndConversation(ctx, message.conversationId);

        await ctx.db.patch(args.messageId, { content: args.content });
        return args.messageId;
    },
});

/**
 * Atomically prepare a conversation for retry or edit-and-regenerate.
 *
 * When `newContent` is provided (edit flow), the target user message is updated
 * and all subsequent messages are deleted. When omitted (retry flow), the target
 * assistant message and everything after it are deleted.
 *
 * This replaces separate `updateContent` + `deleteAfter` client calls to ensure
 * the conversation is either fully rewritten or untouched on failure.
 */
export const prepareRegenerate = mutation({
    args: {
        conversationId: v.id('conversations'),
        targetMessageId: v.id('messages'),
        /** If provided, update the target message to this content before deleting subsequent messages (edit flow). */
        newContent: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Auth check
        await getAuthenticatedUserAndConversation(ctx, args.conversationId);

        const targetMessage = await ctx.db.get(args.targetMessageId);
        if (!targetMessage || targetMessage.conversationId !== args.conversationId) {
            throw new Error('Message not found in conversation');
        }

        // Get all messages in the conversation
        const allMessages = await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) =>
                q.eq('conversationId', args.conversationId)
            )
            .order('asc')
            .collect();

        /** Update conversation stats (messageCount + lastMessageAt) after deletions. */
        const updateConversationStats = async (deletedCount: number) => {
            const conversation = await ctx.db.get(args.conversationId);
            if (conversation) {
                const remaining = await ctx.db
                    .query('messages')
                    .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
                    .order('desc')
                    .first();
                await ctx.db.patch(args.conversationId, {
                    messageCount: Math.max(0, (conversation.messageCount ?? 0) - deletedCount),
                    lastMessageAt: remaining?.createdAt ?? conversation.createdAt,
                });
            }
        };

        if (args.newContent !== undefined) {
            // ── Edit flow: update content, delete everything after ──
            if (targetMessage.role !== 'user') {
                throw new Error('Only user messages can be edited');
            }
            await ctx.db.patch(args.targetMessageId, { content: args.newContent });

            let foundTarget = false;
            let deletedCount = 0;
            for (const msg of allMessages) {
                if (msg._id === args.targetMessageId) {
                    foundTarget = true;
                    continue;
                }
                if (foundTarget) {
                    await ctx.db.delete(msg._id);
                    deletedCount++;
                }
            }

            await updateConversationStats(deletedCount);
        } else {
            // ── Retry flow: delete from target onward ──
            if (targetMessage.role !== 'assistant') {
                throw new Error('Can only retry assistant messages');
            }

            let deletedCount = 0;
            let foundTarget = false;
            for (const msg of allMessages) {
                if (msg._id === args.targetMessageId) {
                    foundTarget = true;
                }
                if (foundTarget) {
                    await ctx.db.delete(msg._id);
                    deletedCount++;
                }
            }

            await updateConversationStats(deletedCount);
        }

        // Return the message history up to (but not including) the deleted messages
        // so the client can immediately stream without an extra query
        const remainingMessages = await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) =>
                q.eq('conversationId', args.conversationId)
            )
            .order('asc')
            .collect();

        return remainingMessages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
        }));
    },
});

/** List messages for a conversation — auth-guarded */
export const list = query({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
        if (!user) return [];

        // Verify conversation ownership
        const conversation = await ctx.db.get(args.conversationId);
        if (!conversation || conversation.userId !== user._id) {
            return [];
        }

        const rows = await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) =>
                q.eq('conversationId', args.conversationId)
            )
            .order('desc')
            .take(200);

        // Bound the DB read first, then filter soft-deleted and legacy client
        // failure rows in memory. This keeps the query predictable while hiding
        // stale transport-error artifacts from the chat transcript.
        const visibleRows = rows
            .filter((msg) => msg.status !== 'deleted' && !isLegacyClientFailureMessage(msg))
            .sort((a, b) => {
                const aTurn = a.turnNumber ?? 0;
                const bTurn = b.turnNumber ?? 0;
                if (aTurn !== bTurn) return aTurn - bTurn;

                const aRole = a.roleOrder ?? (a.role === 'user' ? 0 : 1);
                const bRole = b.roleOrder ?? (b.role === 'user' ? 0 : 1);
                if (aRole !== bRole) return aRole - bRole;

                return a.createdAt - b.createdAt;
            });

        const assistantMessageIds = new Set(
            visibleRows
                .filter((message) => message.role === 'assistant')
                .map((message) => message._id.toString())
        );
        const answerSourceEntries = assistantMessageIds.size > 0
            ? await Promise.all(
                visibleRows
                    .filter((message) => message.role === 'assistant')
                    .map(async (message) => [
                        message._id.toString(),
                        await ctx.db
                            .query('chatAnswerSources')
                            .withIndex('by_message', (q) => q.eq('messageId', message._id))
                            .take(50),
                    ] as const)
            )
            : [];
        const scopedAnswerSources = answerSourceEntries
            .flatMap(([, sources]) => sources)
            .filter((source) =>
                source.messageId &&
                assistantMessageIds.has(source.messageId.toString()) &&
                source.conversationId === args.conversationId &&
                source.clerkUserId === user.clerkId
            );
        const uniqueUploadedFileSources = scopedAnswerSources.filter(
            (source, index, sources) =>
                sources.findIndex((candidate) => candidate.uploadedFileId.toString() === source.uploadedFileId.toString()) === index
        );
        const uniqueChunkSources = scopedAnswerSources.filter(
            (source, index, sources) =>
                sources.findIndex((candidate) => candidate.chunkId.toString() === source.chunkId.toString()) === index
        );
        const [uploadedFileEntries, chunkEntries] = await Promise.all([
            Promise.all(uniqueUploadedFileSources.map(async (source) =>
                [source.uploadedFileId.toString(), await ctx.db.get(source.uploadedFileId)] as const
            )),
            Promise.all(uniqueChunkSources.map(async (source) =>
                [source.chunkId.toString(), await ctx.db.get(source.chunkId)] as const
            )),
        ]);
        const uploadedFilesById = new Map(uploadedFileEntries);
        const chunksById = new Map(chunkEntries);
        const sourcesByMessageId = new Map<string, typeof scopedAnswerSources>();
        for (const source of scopedAnswerSources) {
            if (!source.messageId) continue;
            const messageId = source.messageId.toString();
            sourcesByMessageId.set(messageId, [...(sourcesByMessageId.get(messageId) ?? []), source]);
        }

        return visibleRows.map((message) => {
            if (message.role !== 'assistant') return message;

            const answerSources = sourcesByMessageId.get(message._id.toString()) ?? [];
            if (answerSources.length === 0) return message;

            const citations: Array<{
                id: string;
                uploadedFileId: string;
                filename: string;
                pageStart?: number;
                pageEnd?: number;
                pageLabel?: string;
                citationLabel?: string;
                quotePreview: string;
                citationVerifierStatus: 'verified' | 'partial' | 'failed';
            }> = [];

            for (const source of answerSources.slice(0, 50)) {
                if (
                    source.conversationId !== args.conversationId ||
                    source.messageId !== message._id ||
                    source.clerkUserId !== user.clerkId
                ) {
                    continue;
                }

                const uploadedFile = uploadedFilesById.get(source.uploadedFileId.toString());
                const chunk = chunksById.get(source.chunkId.toString());
                if (
                    !uploadedFile ||
                    uploadedFile.clerkUserId !== user.clerkId ||
                    !chunk ||
                    chunk.uploadedFileId !== uploadedFile._id ||
                    chunk.clerkUserId !== user.clerkId
                ) {
                    continue;
                }

                citations.push({
                    id: source._id.toString(),
                    uploadedFileId: uploadedFile._id.toString(),
                    filename: uploadedFile.filename,
                    pageStart: source.pageStart,
                    pageEnd: source.pageEnd,
                    pageLabel: pageLabel(source.pageStart, source.pageEnd),
                    citationLabel: chunk.citationLabel,
                    quotePreview: quotePreview(source.quotedText),
                    citationVerifierStatus: source.citationVerifierStatus,
                });
            }

            if (citations.length === 0) return message;

            return {
                ...message,
                metadata: {
                    ...asMetadataObject(message.metadata),
                    documentCitations: citations,
                },
            };
        });
    },
});

// ── Server-side message creation (auth-guarded) ──

/**
 * Create a message from the API route.
 * Auth: server-derived via getAuthenticatedUserAndConversation().
 * Supports idempotent writes via requestId de-duplication.
 */
export const createMessage = mutation({
    args: {
        conversationId: v.id('conversations'),
        role: v.union(v.literal('user'), v.literal('assistant')),
        content: v.string(),
        metadata: v.optional(v.any()),
        mode: v.optional(routeModeValidator),
        artifactsJson: v.optional(v.string()),
        requestId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Server-derived auth — NOT caller-supplied
        const { conversation } = await getAuthenticatedUserAndConversation(ctx, args.conversationId);

        if (isLegacyClientFailureMessage(args)) {
            return null;
        }

        // De-dup: if requestId is provided, check for existing message
        if (args.requestId) {
            const existing = await ctx.db
                .query('messages')
                .withIndex('by_conversation_requestId', (q) =>
                    q.eq('conversationId', args.conversationId).eq('requestId', args.requestId)
                )
                .first();
            if (existing) return existing._id;
        }

        const messageId = await ctx.db.insert('messages', {
            conversationId: args.conversationId,
            role: args.role,
            content: args.content,
            metadata: args.metadata,
            mode: args.mode,
            artifactsJson: args.artifactsJson,
            requestId: args.requestId,
            createdAt: Date.now(),
        });

        // Update conversation stats
        await ctx.db.patch(args.conversationId, {
            lastMessageAt: Date.now(),
            messageCount: (conversation.messageCount ?? 0) + 1,
        });

        return messageId;
    },
});

