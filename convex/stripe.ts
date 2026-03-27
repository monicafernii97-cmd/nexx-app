import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

/** Valid subscription tier values — matches schema definition. */
const tierValidator = v.union(
    v.literal('free'),
    v.literal('pro'),
    v.literal('premium'),
    v.literal('executive')
);

/** Valid subscription status values — all 8 Stripe statuses. */
const statusValidator = v.union(
    v.literal('active'),
    v.literal('canceled'),
    v.literal('past_due'),
    v.literal('trialing'),
    v.literal('incomplete'),
    v.literal('incomplete_expired'),
    v.literal('unpaid'),
    v.literal('paused')
);

/**
 * Update a user's Stripe subscription fields.
 * Called by the Stripe webhook handler — uses unauthenticated Convex client
 * since webhooks originate from Stripe (no Clerk auth).
 */
export const updateSubscription = mutation({
    args: {
        clerkId: v.string(),
        stripeCustomerId: v.string(),
        stripeSubscriptionId: v.string(),
        stripePriceId: v.string(),
        subscriptionTier: tierValidator,
        subscriptionStatus: statusValidator,
    },
    handler: async (ctx, args) => {
        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', args.clerkId))
            .first();

        if (!user) {
            throw new Error(`No user found with clerkId: ${args.clerkId}`);
        }

        await ctx.db.patch(user._id, {
            stripeCustomerId: args.stripeCustomerId,
            stripeSubscriptionId: args.stripeSubscriptionId || undefined,
            stripePriceId: args.stripePriceId || undefined,
            subscriptionTier: args.subscriptionTier,
            subscriptionStatus: args.subscriptionStatus,
        });
    },
});

/**
 * Query the authenticated user's own subscription status.
 * Enforces that users can only query their own data by matching
 * the authenticated identity's subject against the requested clerkId.
 */
export const getSubscriptionStatus = query({
    args: { clerkId: v.string() },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('Not authenticated');

        // Enforce authorization: users can only query their own subscription
        if (identity.subject !== args.clerkId) {
            throw new Error('Not authorized: clerkId mismatch');
        }

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', args.clerkId))
            .first();

        if (!user) return null;

        return {
            tier: user.subscriptionTier ?? 'free',
            status: user.subscriptionStatus ?? 'active',
            hasStripeSubscription: !!user.stripeSubscriptionId,
        };
    },
});
