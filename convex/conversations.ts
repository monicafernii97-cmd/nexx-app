import { mutation, query, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { getAuthenticatedUser } from './lib/auth';

// Create a new conversation — auth-guarded
export const create = mutation({
    args: {
        title: v.string(),
        mode: v.union(
            v.literal('therapeutic'),
            v.literal('legal'),
            v.literal('strategic'),
            v.literal('general')
        ),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        return await ctx.db.insert('conversations', {
            userId: user._id,
            title: args.title,
            mode: args.mode,
            status: 'active',
            messageCount: 0,
            lastMessageAt: Date.now(),
            createdAt: Date.now(),
        });
    },
});

// Update conversation title — auth-guarded
export const updateTitle = mutation({
    args: {
        id: v.id('conversations'),
        title: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const conversation = await ctx.db.get(args.id);
        if (!conversation || conversation.userId !== user._id) {
            throw new Error('Not authorized to update this conversation');
        }

        await ctx.db.patch(args.id, { title: args.title });
    },
});

// Archive a conversation — auth-guarded
export const archive = mutation({
    args: { id: v.id('conversations') },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const conversation = await ctx.db.get(args.id);
        if (!conversation || conversation.userId !== user._id) {
            throw new Error('Not authorized to archive this conversation');
        }

        await ctx.db.patch(args.id, { status: 'archived' as const });
    },
});

// Delete a conversation and all its messages — auth-guarded
export const remove = mutation({
    args: { id: v.id('conversations') },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const conversation = await ctx.db.get(args.id);
        if (!conversation || conversation.userId !== user._id) {
            throw new Error('Not authorized to delete this conversation');
        }

        // Schedule batched message deletion (avoids Convex mutation limits).
        // The conversation itself is deleted only after all messages are gone,
        // preventing orphaned messages if a scheduled job fails.
        await ctx.scheduler.runAfter(0, internal.conversations.deleteMessagesBatch, {
            conversationId: args.id,
            deleteConversation: true,
        });
    },
});

/** Delete messages in batches to stay within Convex mutation limits. */
const BATCH_SIZE = 500;

export const deleteMessagesBatch = internalMutation({
    args: {
        conversationId: v.id('conversations'),
        deleteConversation: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const batch = await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
            .take(BATCH_SIZE);

        for (const msg of batch) {
            await ctx.db.delete(msg._id);
        }

        if (batch.length === BATCH_SIZE) {
            // More messages remain — schedule continuation
            await ctx.scheduler.runAfter(0, internal.conversations.deleteMessagesBatch, {
                conversationId: args.conversationId,
                deleteConversation: args.deleteConversation,
            });
        } else if (args.deleteConversation) {
            // All messages deleted — now safe to remove the conversation
            const conversation = await ctx.db.get(args.conversationId);
            if (conversation) {
                await ctx.db.delete(args.conversationId);
            }
        }
    },
});

// ── Queries ──

// List conversations for the authenticated user
export const list = query({
    args: {
        status: v.optional(
            v.union(v.literal('active'), v.literal('archived'))
        ),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
        if (!user) return [];

        if (args.status) {
            return await ctx.db
                .query('conversations')
                .withIndex('by_user_status', (q) =>
                    q.eq('userId', user._id).eq('status', args.status!)
                )
                .order('desc')
                .collect();
        }

        return await ctx.db
            .query('conversations')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .order('desc')
            .collect();
    },
});

// Get a single conversation — auth-guarded
export const get = query({
    args: { id: v.id('conversations') },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('Not authenticated');

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
        if (!user) throw new Error('User not found');

        const conversation = await ctx.db.get(args.id);
        if (!conversation || conversation.userId !== user._id) {
            throw new Error('Not authorized');
        }
        return conversation;
    },
});
