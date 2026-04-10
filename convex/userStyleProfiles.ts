import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUser } from './lib/auth';

/**
 * User Style Profiles — learned preferences that adapt NEXX's output.
 * These are safe-to-adapt dimensions: formatting, detail level, tone.
 * Never-adapt: legal substance, rigor, citations, safety, neutrality.
 *
 * Auth: resolves userId from ctx.auth identity, not from args.
 */

export const upsert = mutation({
    args: {
        prefersJudgeLens: v.optional(v.boolean()),
        prefersCourtReadyDefault: v.optional(v.boolean()),
        prefersDetailedResponses: v.optional(v.boolean()),
        prefersStepByStepProcess: v.optional(v.boolean()),
        tonePreference: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const userId = user._id;

        const existing = await ctx.db
            .query('userStyleProfiles')
            .withIndex('by_userId', (q) => q.eq('userId', userId))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                ...args,
                updatedAt: Date.now(),
            });
            return existing._id;
        }

        return await ctx.db.insert('userStyleProfiles', {
            userId,
            ...args,
            updatedAt: Date.now(),
        });
    },
});

export const getByUser = query({
    args: {},
    handler: async (ctx) => {
        const user = await getAuthenticatedUser(ctx);
        return await ctx.db
            .query('userStyleProfiles')
            .withIndex('by_userId', (q) => q.eq('userId', user._id))
            .first();
    },
});
