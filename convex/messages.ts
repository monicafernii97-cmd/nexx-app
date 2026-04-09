import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUserAndConversation } from './lib/auth';
/** ── Mutations ── */

/** Send a message — auth-guarded */
export const send = mutation({
    args: {
        conversationId: v.id('conversations'),
        role: v.union(v.literal('user'), v.literal('assistant')),
        content: v.string(),
        metadata: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        await getAuthenticatedUserAndConversation(ctx, args.conversationId);

        const messageId = await ctx.db.insert('messages', {
            conversationId: args.conversationId,
            role: args.role,
            content: args.content,
            metadata: args.metadata,
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

/** Update a message's content — auth-guarded, user must own the conversation */
export const updateContent = mutation({
    args: {
        messageId: v.id('messages'),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        const message = await ctx.db.get(args.messageId);
        if (!message) throw new Error('Message not found');

        // Auth check: verify ownership
        await getAuthenticatedUserAndConversation(ctx, message.conversationId);

        await ctx.db.patch(args.messageId, { content: args.content });
        return args.messageId;
    },
});

/** Delete all messages in a conversation after a given message (by createdAt timestamp).
 *  Used for edit-and-regenerate: when a user edits an earlier message,
 *  all subsequent messages must be removed so the AI can re-answer fresh. */
export const deleteAfter = mutation({
    args: {
        conversationId: v.id('conversations'),
        afterMessageId: v.id('messages'),
    },
    handler: async (ctx, args) => {
        // Auth check
        await getAuthenticatedUserAndConversation(ctx, args.conversationId);

        const targetMessage = await ctx.db.get(args.afterMessageId);
        if (!targetMessage) throw new Error('Message not found');

        // Get all messages in the conversation
        const allMessages = await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) =>
                q.eq('conversationId', args.conversationId)
            )
            .order('asc')
            .collect();

        // Delete everything after the target message
        let foundTarget = false;
        let deletedCount = 0;
        for (const msg of allMessages) {
            if (msg._id === args.afterMessageId) {
                foundTarget = true;
                continue; // Keep the target itself
            }
            if (foundTarget) {
                await ctx.db.delete(msg._id);
                deletedCount++;
            }
        }

        // Update conversation messageCount
        const conversation = await ctx.db.get(args.conversationId);
        if (conversation) {
            await ctx.db.patch(args.conversationId, {
                messageCount: Math.max(0, (conversation.messageCount ?? 0) - deletedCount),
            });
        }

        return deletedCount;
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
