import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const create = mutation({
    args: {
        userId: v.id('users'),
        behaviors: v.array(v.string()),
        description: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert('nexProfiles', {
            userId: args.userId,
            behaviors: args.behaviors,
            description: args.description,
            createdAt: Date.now(),
        });
    },
});

export const getByUser = query({
    args: { userId: v.id('users') },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('nexProfiles')
            .withIndex('by_user', (q) => q.eq('userId', args.userId))
            .first();
    },
});
