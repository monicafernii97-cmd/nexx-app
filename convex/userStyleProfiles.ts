import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * User Style Profiles — learned preferences that adapt NEXX's output.
 * These are safe-to-adapt dimensions: formatting, detail level, tone.
 * Never-adapt: legal substance, rigor, citations, safety, neutrality.
 */

export const upsert = mutation({
    args: {
        userId: v.id('users'),
        prefersJudgeLens: v.optional(v.boolean()),
        prefersCourtReadyDefault: v.optional(v.boolean()),
        prefersDetailedResponses: v.optional(v.boolean()),
        prefersStepByStepProcess: v.optional(v.boolean()),
        tonePreference: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query('userStyleProfiles')
            .withIndex('by_userId', (q) => q.eq('userId', args.userId))
            .first();

        const { userId: _userId, ...profileFields } = args;

        if (existing) {
            await ctx.db.patch(existing._id, {
                ...profileFields,
                updatedAt: Date.now(),
            });
            return existing._id;
        }

        return await ctx.db.insert('userStyleProfiles', {
            userId: args.userId,
            ...profileFields,
            updatedAt: Date.now(),
        });
    },
});

export const getByUser = query({
    args: { userId: v.id('users') },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('userStyleProfiles')
            .withIndex('by_userId', (q) => q.eq('userId', args.userId))
            .first();
    },
});
