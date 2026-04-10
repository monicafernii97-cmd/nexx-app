import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Retrieved Sources — legal sources retrieved per conversation.
 * Stored for auditability: which sources were used to inform which responses.
 */

export const create = mutation({
    args: {
        conversationId: v.id('conversations'),
        title: v.string(),
        url: v.string(),
        sourceType: v.string(),
        snippet: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert('retrievedSources', {
            ...args,
            createdAt: Date.now(),
        });
    },
});

export const getByConversation = query({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('retrievedSources')
            .withIndex('by_conversationId', (q) => q.eq('conversationId', args.conversationId))
            .order('desc')
            .collect();
    },
});
