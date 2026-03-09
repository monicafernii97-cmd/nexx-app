import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// ── Helper: resolve authenticated user ──
async function getAuthenticatedUser(ctx: any) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const user = await ctx.db
        .query('users')
        .withIndex('by_clerk', (q: any) => q.eq('clerkId', identity.subject))
        .first();
    if (!user) throw new Error('User not found');
    return user;
}

// Create a NEX profile — auth-guarded
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

// Get NEX profile for the authenticated user
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

// Update an existing NEX profile — auth-guarded
export const update = mutation({
    args: {
        id: v.id('nexProfiles'),
        behaviors: v.optional(v.array(v.string())),
        nickname: v.optional(v.string()),
        relationship: v.optional(v.string()),
        description: v.optional(v.string()),
        communicationStyle: v.optional(v.string()),
        manipulationTactics: v.optional(v.array(v.string())),
        triggerPatterns: v.optional(v.array(v.string())),
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
            Object.entries(updates).filter(([_, v]) => v !== undefined)
        );
        if (Object.keys(filtered).length > 0) {
            await ctx.db.patch(id, { ...filtered, updatedAt: Date.now() });
        }
    },
});
