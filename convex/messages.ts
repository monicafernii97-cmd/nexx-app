import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUserAndConversation } from './lib/auth';
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
    },
    handler: async (ctx, args) => {
        await getAuthenticatedUserAndConversation(ctx, args.conversationId);

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

        return await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) =>
                q.eq('conversationId', args.conversationId)
            )
            .order('asc')
            .collect();
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
        mode: v.optional(v.union(
            v.literal('adaptive_chat'),
            v.literal('direct_legal_answer'),
            v.literal('local_procedure'),
            v.literal('document_analysis'),
            v.literal('judge_lens_strategy'),
            v.literal('court_ready_drafting'),
            v.literal('pattern_analysis'),
            v.literal('support_grounding'),
            v.literal('safety_escalation')
        )),
        artifactsJson: v.optional(v.string()),
        requestId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Server-derived auth — NOT caller-supplied
        const { conversation } = await getAuthenticatedUserAndConversation(ctx, args.conversationId);

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

