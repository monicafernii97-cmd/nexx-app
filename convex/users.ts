import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// Ensure a Convex user exists for a given Clerk user
export const ensureFromClerk = mutation({
    args: {
        clerkId: v.string(),
        name: v.string(),
        email: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Check if user with this clerkId already exists
        const existing = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', args.clerkId))
            .first();

        if (existing) {
            // Update name/email if changed
            await ctx.db.patch(existing._id, {
                name: args.name,
                email: args.email,
            });
            return existing._id;
        }

        // Create new user
        return await ctx.db.insert('users', {
            clerkId: args.clerkId,
            name: args.name,
            email: args.email,
            role: 'parent',
            onboardingComplete: false,
            createdAt: Date.now(),
        });
    },
});

// Get user by Clerk ID
export const getByClerkId = query({
    args: { clerkId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', args.clerkId))
            .first();
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

// Legacy: Create a guest user (kept for backward compatibility)
export const createOrGet = mutation({
    args: {
        name: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert('users', {
            name: args.name,
            role: 'parent',
            onboardingComplete: false,
            createdAt: Date.now(),
        });
    },
});
