import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

/** Ensure a Convex user exists for a given Clerk user — auth-guarded */
export const ensureFromClerk = mutation({
    args: {
        clerkId: v.string(),
        name: v.string(),
        email: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Auth guard: verify caller is authenticated and clerkId matches
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('Not authenticated');
        if (identity.subject !== args.clerkId) {
            throw new Error('Not authorized: clerkId mismatch');
        }

        // Check if user with this clerkId already exists
        const existing = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', args.clerkId))
            .first();

        if (existing) {
            // Only patch if name or email actually changed
            const patch: Record<string, string | undefined> = {};
            if (existing.name !== args.name) patch.name = args.name;
            if (args.email !== undefined && existing.email !== args.email) patch.email = args.email;

            if (Object.keys(patch).length > 0) {
                await ctx.db.patch(existing._id, patch);
            }
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

/** Get the authenticated user's own record — derives clerkId from auth context */
export const me = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        return await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
    },
});

/** Get user by ID — auth-guarded */
export const get = query({
    args: { id: v.id('users') },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('Not authenticated');
        const user = await ctx.db.get(args.id);
        if (!user || user.clerkId !== identity.subject) {
            throw new Error('Not authorized');
        }
        return user;
    },
});

/** Update user profile (onboarding data) — auth-guarded */
export const updateProfile = mutation({
    args: {
        id: v.id('users'),
        name: v.optional(v.union(v.string(), v.null())),
        avatarUrl: v.optional(v.union(v.string(), v.null())),
        phone: v.optional(v.union(v.string(), v.null())),
        state: v.optional(v.union(v.string(), v.null())),
        county: v.optional(v.union(v.string(), v.null())),
        childrenCount: v.optional(v.union(v.number(), v.null())),
        childrenAges: v.optional(v.union(v.array(v.number()), v.null())),
        childrenNames: v.optional(v.union(v.array(v.string()), v.null())),
        children: v.optional(v.union(v.array(v.object({ name: v.string(), age: v.number() })), v.null())),
        courtCaseNumber: v.optional(v.union(v.string(), v.null())),
        custodyType: v.optional(
            v.union(
                v.literal('sole'),
                v.literal('joint'),
                v.literal('split'),
                v.literal('visitation'),
                v.literal('none'),
                v.literal('pending'),
                v.null()
            )
        ),
        hasAttorney: v.optional(v.union(v.boolean(), v.null())),
        hasTherapist: v.optional(v.union(v.boolean(), v.null())),
        courtStatus: v.optional(
            v.union(
                v.literal('pending'),
                v.literal('active'),
                v.literal('closed'),
                v.literal('none'),
                v.null()
            )
        ),
        tonePreference: v.optional(
            v.union(
                v.literal('direct'),
                v.literal('gentle'),
                v.literal('strategic'),
                v.literal('clinical'),
                v.null()
            )
        ),
        emotionalState: v.optional(
            v.union(
                v.literal('calm'),
                v.literal('anxious'),
                v.literal('angry'),
                v.literal('overwhelmed'),
                v.literal('numb'),
                v.null()
            )
        ),
        subscriptionTier: v.optional(v.union(
            v.literal('free'),
            v.literal('pro'),
            v.literal('premium'),
            v.literal('executive'),
            v.null()
        )),
        primaryGoals: v.optional(v.union(v.array(v.string()), v.null())),
    },
    handler: async (ctx, args) => {
        // Auth guard: verify caller owns this user record
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('Not authenticated');
        const user = await ctx.db.get(args.id);
        if (!user || user.clerkId !== identity.subject) {
            throw new Error('Not authorized to update this profile');
        }

        const { id, ...updates } = args;
        // Normalize: null → undefined (schema uses v.optional which doesn't accept null).
        // undefined = no change, null = caller wants to clear the field.
        const filtered = Object.fromEntries(
            Object.entries(updates)
                .filter(([, val]) => val !== undefined)
                .map(([key, val]) => [key, val === null ? undefined : val])
        );
        if (Object.keys(filtered).length > 0) {
            await ctx.db.patch(id, filtered);
        }
    },
});

/** Complete onboarding — auth-guarded */
export const completeOnboarding = mutation({
    args: { id: v.id('users') },
    handler: async (ctx, args) => {
        // Auth guard: verify caller owns this user record
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('Not authenticated');
        const user = await ctx.db.get(args.id);
        if (!user || user.clerkId !== identity.subject) {
            throw new Error('Not authorized to complete onboarding for this user');
        }

        await ctx.db.patch(args.id, { onboardingComplete: true });
    },
});

/** Look up user by Clerk ID — auth-guarded. Used by API routes to fetch tier info. */
export const getByClerkId = query({
    args: { clerkId: v.string() },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('Not authenticated');
        if (identity.subject !== args.clerkId) {
            throw new Error('Not authorized: clerkId mismatch');
        }
        return await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', args.clerkId))
            .first();
    },
});

/** Admin mutation to set a user's subscription tier — restricted to the user's own record. */
export const setSubscriptionTier = mutation({
    args: {
        id: v.id('users'),
        tier: v.union(
            v.literal('free'),
            v.literal('pro'),
            v.literal('premium'),
            v.literal('executive')
        ),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('Not authenticated');

        // Authorization: verify the caller owns this user record
        const user = await ctx.db.get(args.id);
        if (!user || user.clerkId !== identity.subject) {
            throw new Error('Not authorized to modify this user');
        }

        await ctx.db.patch(args.id, { subscriptionTier: args.tier });
    },
});
