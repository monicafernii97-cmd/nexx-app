import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Conversation Summaries — compacted memory for long conversations.
 * Summaries are upserted every 6 turns by the persistAfterResponse() hook.
 */

export const upsert = mutation({
    args: {
        conversationId: v.id('conversations'),
        summary: v.string(),
        turnCount: v.number(),
    },
    handler: async (ctx, args) => {
        if (!Number.isInteger(args.turnCount) || args.turnCount < 0) {
            throw new Error("turnCount must be a non-negative integer");
        }

        const existing = await ctx.db
            .query('conversationSummaries')
            .withIndex('by_conversationId', (q) => q.eq('conversationId', args.conversationId))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                summary: args.summary,
                turnCount: args.turnCount,
                updatedAt: Date.now(),
            });
            return existing._id;
        }

        return await ctx.db.insert('conversationSummaries', {
            conversationId: args.conversationId,
            summary: args.summary,
            turnCount: args.turnCount,
            updatedAt: Date.now(),
        });
    },
});

export const getByConversation = query({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('conversationSummaries')
            .withIndex('by_conversationId', (q) => q.eq('conversationId', args.conversationId))
            .first();
    },
});
