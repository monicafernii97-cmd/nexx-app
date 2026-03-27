import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

/**
 * Update a user's Stripe subscription fields.
 * Called by the Stripe webhook handler — uses CONVEX_DEPLOY_KEY auth
 * rather than Clerk auth, since webhooks originate from Stripe.
 */
export const updateSubscription = mutation({
    args: {
        clerkId: v.string(),
        stripeCustomerId: v.string(),
        stripeSubscriptionId: v.string(),
        stripePriceId: v.string(),
        subscriptionTier: v.string(),
        subscriptionStatus: v.string(),
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
            subscriptionTier: args.subscriptionTier as 'free' | 'pro' | 'premium' | 'executive',
            subscriptionStatus: args.subscriptionStatus as 'active' | 'canceled' | 'past_due' | 'trialing',
        });
    },
});

/** Query a user's subscription status by Clerk ID. */
export const getSubscriptionStatus = query({
    args: { clerkId: v.string() },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('Not authenticated');

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
