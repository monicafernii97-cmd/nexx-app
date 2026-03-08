import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// Create or get a user (for now, creates a guest user)
export const createOrGet = mutation({
    args: {
        name: v.string(),
    },
    handler: async (ctx, args) => {
        // For now, just create a new user each time
        // Later this will integrate with Clerk
        const userId = await ctx.db.insert('users', {
            name: args.name,
            role: 'parent',
            onboardingComplete: false,
            createdAt: Date.now(),
        });
        return userId;
    },
});

// Get user by ID
export const get = query({
    args: { id: v.id('users') },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});

// Update user profile (onboarding data)
export const updateProfile = mutation({
    args: {
        id: v.id('users'),
        name: v.optional(v.string()),
        state: v.optional(v.string()),
        county: v.optional(v.string()),
        childrenCount: v.optional(v.number()),
        childrenAges: v.optional(v.string()),
        custodyType: v.optional(v.string()),
        hasAttorney: v.optional(v.string()),
        hasTherapist: v.optional(v.string()),
        primaryGoals: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
        const { id, ...updates } = args;
        const filtered = Object.fromEntries(
            Object.entries(updates).filter(([_, v]) => v !== undefined)
        );
        await ctx.db.patch(id, filtered);
    },
});

// Complete onboarding
export const completeOnboarding = mutation({
    args: { id: v.id('users') },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, { onboardingComplete: true });
    },
});
