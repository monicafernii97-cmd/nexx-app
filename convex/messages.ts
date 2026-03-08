import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// Send a message
export const send = mutation({
    args: {
        conversationId: v.id('conversations'),
        role: v.union(v.literal('user'), v.literal('assistant')),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        const messageId = await ctx.db.insert('messages', {
            conversationId: args.conversationId,
            role: args.role,
            content: args.content,
            createdAt: Date.now(),
        });

        // Update conversation's lastMessageAt
        await ctx.db.patch(args.conversationId, {
            lastMessageAt: Date.now(),
        });

        return messageId;
    },
});

// List messages for a conversation
export const list = query({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) =>
                q.eq('conversationId', args.conversationId)
            )
            .order('asc')
            .collect();
    },
});
