import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUser } from './lib/auth';
import {
    getDailyLimit,
    PRIMARY_MODEL,
    PRO_MODEL,
} from '../src/lib/tiers';
import { CHAT_RATE_LIMIT_WINDOW_MS, fixedWindowStartMs, userSubscriptionTier } from './lib/chatRateLimitPolicy';

const CHAT_RATE_LIMIT_KEY_VALIDATOR = v.union(
    v.literal('chat_message_5_4'),
    v.literal('chat_message_5_4_pro'),
);

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
        windowMs: CHAT_RATE_LIMIT_WINDOW_MS,
    };
}

/** Consume one unit from the authenticated user's named rate-limit window. */
export const consume = mutation({
    args: {
        key: CHAT_RATE_LIMIT_KEY_VALIDATOR,
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
