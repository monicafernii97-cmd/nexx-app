import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Case Graphs — structured case intelligence per user.
 * The graph is a JSON blob of CaseGraph type, updated after every chat response.
 */

export const upsert = mutation({
    args: {
        userId: v.id('users'),
        graphJson: v.string(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query('caseGraphs')
            .withIndex('by_userId', (q) => q.eq('userId', args.userId))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                graphJson: args.graphJson,
                updatedAt: Date.now(),
            });
            return existing._id;
        }

        return await ctx.db.insert('caseGraphs', {
            userId: args.userId,
            graphJson: args.graphJson,
            updatedAt: Date.now(),
        });
    },
});

export const getByUser = query({
    args: { userId: v.id('users') },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('caseGraphs')
            .withIndex('by_userId', (q) => q.eq('userId', args.userId))
            .first();
    },
});
