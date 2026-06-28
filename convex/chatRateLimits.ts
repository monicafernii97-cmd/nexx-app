import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUser } from './lib/auth';
import {
    getDailyLimit,
    PRIMARY_MODEL,
    PRO_MODEL,
    type SubscriptionTier,
} from '../src/lib/tiers';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function fixedWindowStartMs(now: number, windowMs: number) {
    return Math.floor(now / windowMs) * windowMs;
}

function userSubscriptionTier(user: { subscriptionTier?: string }): SubscriptionTier {
    return user.subscriptionTier === 'pro' ||
        user.subscriptionTier === 'premium' ||
        user.subscriptionTier === 'executive'
        ? user.subscriptionTier
        : 'free';
}

function rateLimitPolicyForKey(user: { subscriptionTier?: string }, key: string) {
    const model = key === 'chat_message_5_4_pro'
        ? PRO_MODEL
        : key === 'chat_message_5_4'
            ? PRIMARY_MODEL
            : null;
    if (!model) throw new Error('Unknown rate-limit key');
    return {
        key,
        limit: getDailyLimit(userSubscriptionTier(user), model),
        windowMs: ONE_DAY_MS,
    };
}

/** Consume one unit from the authenticated user's named rate-limit window. */
export const consume = mutation({
    args: {
        key: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const now = Date.now();
        const policy = rateLimitPolicyForKey(user, args.key);
        const windowMs = policy.windowMs;
        const windowStartMs = fixedWindowStartMs(now, windowMs);
        const resetInMs = Math.max(0, windowStartMs + windowMs - now);

        if (policy.limit === -1) {
            return { allowed: true, current: 0, limit: -1, resetInMs };
        }

        if (policy.limit <= 0) {
            return { allowed: false, current: 0, limit: policy.limit, resetInMs };
        }

        const existing = await ctx.db
            .query('chatRateLimitWindows')
            .withIndex('by_user_key', (q) => q.eq('userId', user._id).eq('key', policy.key))
            .first();

        if (!existing || existing.windowStartMs !== windowStartMs || existing.windowMs !== windowMs) {
            const count = 1;
            if (existing) {
                await ctx.db.patch(existing._id, {
                    windowStartMs,
                    windowMs,
                    count,
                    limit: policy.limit,
                    updatedAt: now,
                });
            } else {
                await ctx.db.insert('chatRateLimitWindows', {
                    userId: user._id,
                    key: policy.key,
                    windowStartMs,
                    windowMs,
                    count,
                    limit: policy.limit,
                    createdAt: now,
                    updatedAt: now,
                });
            }

            return { allowed: true, current: count, limit: policy.limit, resetInMs };
        }

        if (existing.count >= policy.limit) {
            if (existing.limit !== policy.limit) {
                await ctx.db.patch(existing._id, {
                    limit: policy.limit,
                    updatedAt: now,
                });
            }
            return { allowed: false, current: existing.count, limit: policy.limit, resetInMs };
        }

        const count = existing.count + 1;
        await ctx.db.patch(existing._id, {
            count,
            limit: policy.limit,
            updatedAt: now,
        });

        return { allowed: true, current: count, limit: policy.limit, resetInMs };
    },
});
