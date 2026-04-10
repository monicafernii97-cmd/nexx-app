import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Tool Runs — audit trail for tool executions.
 * Records every function tool call made during a chat response,
 * including the input sent to the tool and the output received.
 */

export const create = mutation({
    args: {
        conversationId: v.id('conversations'),
        toolType: v.string(),
        inputJson: v.string(),
        outputJson: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert('toolRuns', {
            ...args,
            createdAt: Date.now(),
        });
    },
});

export const getByConversation = query({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('toolRuns')
            .withIndex('by_conversationId', (q) => q.eq('conversationId', args.conversationId))
            .order('desc')
            .collect();
    },
});
