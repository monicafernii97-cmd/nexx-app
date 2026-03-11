import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUser } from './lib/auth';

// ── Mutations ──

/** Create or update court settings for the authenticated user. */
export const upsert = mutation({
    args: {
        state: v.string(),
        county: v.string(),
        courtName: v.optional(v.string()),
        judicialDistrict: v.optional(v.string()),
        assignedJudge: v.optional(v.string()),
        causeNumber: v.optional(v.string()),
        formattingOverrides: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const now = Date.now();

        // Check if user already has settings
        const existing = await ctx.db
            .query('userCourtSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .first();

        if (existing) {
            // Update existing
            await ctx.db.patch(existing._id, {
                ...args,
                updatedAt: now,
            });
            return existing._id;
        }

        // Create new
        return await ctx.db.insert('userCourtSettings', {
            userId: user._id,
            ...args,
            createdAt: now,
            updatedAt: now,
        });
    },
});

/** Mark court settings as AI-verified. */
export const markAiVerified = mutation({
    args: {
        id: v.id('userCourtSettings'),
        formattingOverrides: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const settings = await ctx.db.get(args.id);
        if (!settings || settings.userId !== user._id) {
            throw new Error('Not authorized');
        }

        await ctx.db.patch(args.id, {
            aiVerified: true,
            aiVerifiedAt: Date.now(),
            ...(args.formattingOverrides ? { formattingOverrides: args.formattingOverrides } : {}),
            updatedAt: Date.now(),
        });
    },
});

/** Delete court settings. */
export const remove = mutation({
    args: { id: v.id('userCourtSettings') },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const settings = await ctx.db.get(args.id);
        if (!settings || settings.userId !== user._id) {
            throw new Error('Not authorized');
        }

        await ctx.db.delete(args.id);
    },
});

// ── Queries ──

/** Get the authenticated user's court settings. */
export const get = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
        if (!user) return null;

        return await ctx.db
            .query('userCourtSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .first();
    },
});
