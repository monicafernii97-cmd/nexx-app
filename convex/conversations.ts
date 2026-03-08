import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// Create a new conversation
export const create = mutation({
    args: {
        userId: v.id('users'),
        title: v.string(),
        mode: v.union(
            v.literal('therapeutic'),
            v.literal('legal'),
            v.literal('strategic'),
            v.literal('general')
        ),
    },
    handler: async (ctx, args) => {
        const conversationId = await ctx.db.insert('conversations', {
            userId: args.userId,
            title: args.title,
            mode: args.mode,
            lastMessageAt: Date.now(),
            createdAt: Date.now(),
        });
        return conversationId;
    },
});

// List conversations for a user
export const list = query({
    args: { userId: v.id('users') },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('conversations')
            .withIndex('by_user', (q) => q.eq('userId', args.userId))
            .order('desc')
            .collect();
    },
});

// Get a single conversation
export const get = query({
    args: { id: v.id('conversations') },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});
