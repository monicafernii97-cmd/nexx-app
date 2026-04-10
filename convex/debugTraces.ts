import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Debug Traces — auditability for every AI call.
 * Each trace captures the full lifecycle: request → generation → validation → recovery → outcome.
 * The debugJson field stores the serialized NexxTrace object.
 */

export const create = mutation({
    args: {
        traceId: v.string(),
        route: v.string(),
        routeMode: v.string(),
        userId: v.string(),
        conversationId: v.optional(v.id('conversations')),
        debugJson: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert('debugTraces', {
            ...args,
            createdAt: Date.now(),
        });
    },
});

export const getByConversation = query({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('debugTraces')
            .withIndex('by_conversationId', (q) => q.eq('conversationId', args.conversationId))
            .order('desc')
            .collect();
    },
});

export const getByTraceId = query({
    args: { traceId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('debugTraces')
            .withIndex('by_traceId', (q) => q.eq('traceId', args.traceId))
            .first();
    },
});
