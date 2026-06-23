import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUser } from "./lib/auth";

/**
 * Case Graphs — structured case intelligence per user.
 * The graph is a JSON blob of CaseGraph type, updated after every chat response.
 */

export const upsert = mutation({
    args: {
        userId: v.optional(v.id('users')),
        graphJson: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        if (args.userId && args.userId !== user._id) {
            throw new Error('Not authorized to update this case graph');
        }
        try {
            JSON.parse(args.graphJson);
        } catch {
            throw new Error("Invalid graphJson: must be valid JSON");
        }

        const existing = await ctx.db
            .query('caseGraphs')
            .withIndex('by_userId', (q) => q.eq('userId', user._id))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                graphJson: args.graphJson,
                updatedAt: Date.now(),
            });
            return existing._id;
        }

        return await ctx.db.insert('caseGraphs', {
            userId: user._id,
            graphJson: args.graphJson,
            updatedAt: Date.now(),
        });
    },
});

export const getByUser = query({
    args: {},
    handler: async (ctx) => {
        const user = await getAuthenticatedUser(ctx);
        return await ctx.db
            .query('caseGraphs')
            .withIndex('by_userId', (q) => q.eq('userId', user._id))
            .first();
    },
});
