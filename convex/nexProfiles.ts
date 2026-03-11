import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUser } from './lib/auth';

/** ── Mutations ── */

/** Create a NEX profile — auth-guarded */
export const create = mutation({
    args: {
        behaviors: v.array(v.string()),
        nickname: v.optional(v.string()),
        relationship: v.optional(v.string()),
        description: v.optional(v.string()),
        communicationStyle: v.optional(v.string()),
        manipulationTactics: v.optional(v.array(v.string())),
        triggerPatterns: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        return await ctx.db.insert('nexProfiles', {
            userId: user._id,
            behaviors: args.behaviors,
            nickname: args.nickname,
            relationship: args.relationship,
            description: args.description,
            communicationStyle: args.communicationStyle,
            manipulationTactics: args.manipulationTactics,
            triggerPatterns: args.triggerPatterns,
            createdAt: Date.now(),
        });
    },
});

/** Get NEX profile for the authenticated user */
export const getByUser = query({
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
            .query('nexProfiles')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .first();
    },
});

/** Update an existing NEX profile — auth-guarded */
export const update = mutation({
    args: {
        id: v.id('nexProfiles'),
        behaviors: v.optional(v.array(v.string())),
        nickname: v.optional(v.union(v.string(), v.null())),
        relationship: v.optional(v.union(v.string(), v.null())),
        description: v.optional(v.union(v.string(), v.null())),
        communicationStyle: v.optional(v.union(v.string(), v.null())),
        manipulationTactics: v.optional(v.union(v.array(v.string()), v.null())),
        triggerPatterns: v.optional(v.union(v.array(v.string()), v.null())),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        // Verify ownership
        const profile = await ctx.db.get(args.id);
        if (!profile || profile.userId !== user._id) {
            throw new Error('Not authorized to update this NEX profile');
        }

        const { id, ...updates } = args;
        const filtered = Object.fromEntries(
            Object.entries(updates).filter(([, val]) => val !== undefined)
        );
        if (Object.keys(filtered).length > 0) {
            await ctx.db.patch(id, { ...filtered, updatedAt: Date.now() });
        }
    },
});

/** Update AI-generated insights on a NEX profile — auth-guarded */
export const updateAiInsights = mutation({
    args: {
        id: v.id('nexProfiles'),
        aiInsights: v.optional(v.string()),
        dangerLevel: v.optional(v.number()),
        detectedPatterns: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        // Verify ownership
        const profile = await ctx.db.get(args.id);
        if (!profile || profile.userId !== user._id) {
            throw new Error('Not authorized to update this NEX profile');
        }

        // Validate dangerLevel range if provided
        if (args.dangerLevel !== undefined && (args.dangerLevel < 1 || args.dangerLevel > 5 || !Number.isInteger(args.dangerLevel))) {
            throw new Error('dangerLevel must be an integer between 1 and 5');
        }

        const { id, ...updates } = args;
        const filtered = Object.fromEntries(
            // undefined = no change (AI insight fields are not nullable)
            Object.entries(updates).filter(([, val]) => val !== undefined)
        );
        if (Object.keys(filtered).length > 0) {
            await ctx.db.patch(id, {
                ...filtered,
                lastAnalyzedAt: Date.now(),
                updatedAt: Date.now(),
            });
        }
    },
});
