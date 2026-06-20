import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUser } from './lib/auth';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Return the UTC midnight timestamp that anchors a daily rate-limit window. */
function utcDayStartMs(now: number) {
    const date = new Date(now);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Consume one unit from the authenticated user's named rate-limit window. */
export const consume = mutation({
    args: {
        key: v.string(),
        limit: v.number(),
        windowMs: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const now = Date.now();
        const windowMs = args.windowMs ?? ONE_DAY_MS;
        const windowStartMs = utcDayStartMs(now);
        const resetInMs = Math.max(0, windowStartMs + windowMs - now);

        if (args.limit === -1) {
            return { allowed: true, current: 0, limit: -1, resetInMs };
        }

        if (args.limit <= 0) {
            return { allowed: false, current: 0, limit: args.limit, resetInMs };
        }

        const existing = await ctx.db
            .query('chatRateLimitWindows')
            .withIndex('by_user_key', (q) => q.eq('userId', user._id).eq('key', args.key))
            .first();

        if (!existing || existing.windowStartMs !== windowStartMs || existing.windowMs !== windowMs) {
            const count = 1;
            if (existing) {
                await ctx.db.patch(existing._id, {
                    windowStartMs,
                    windowMs,
                    count,
                    limit: args.limit,
                    updatedAt: now,
                });
            } else {
                await ctx.db.insert('chatRateLimitWindows', {
                    userId: user._id,
                    key: args.key,
                    windowStartMs,
                    windowMs,
                    count,
                    limit: args.limit,
                    createdAt: now,
                    updatedAt: now,
                });
            }

            return { allowed: true, current: count, limit: args.limit, resetInMs };
        }

        if (existing.count >= args.limit) {
            return { allowed: false, current: existing.count, limit: args.limit, resetInMs };
        }

        const count = existing.count + 1;
        await ctx.db.patch(existing._id, {
            count,
            limit: args.limit,
            updatedAt: now,
        });

        return { allowed: true, current: count, limit: args.limit, resetInMs };
    },
});
