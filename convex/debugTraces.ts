import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Debug Traces — auditability for every AI call.
 * Each trace captures the full lifecycle: request → generation → validation → recovery → outcome.
 * The debugJson field stores the serialized NexxTrace object.
 *
 * Ownership: create verifies conversationId belongs to callerUserId.
 * Read queries verify conversation ownership before returning data.
 */

export const create = mutation({
    args: {
        traceId: v.string(),
        route: v.string(),
        routeMode: v.string(),
        callerUserId: v.string(),
        conversationId: v.optional(v.id('conversations')),
        debugJson: v.string(),
    },
    handler: async (ctx, args) => {
        // Verify conversation ownership if provided
        if (args.conversationId) {
            const conversation = await ctx.db.get(args.conversationId);
            if (!conversation) throw new Error('Conversation not found');
            if (String(conversation.userId) !== args.callerUserId) {
                throw new Error('Unauthorized: caller does not own this conversation');
            }
        }

        return await ctx.db.insert('debugTraces', {
            traceId: args.traceId,
            route: args.route,
            routeMode: args.routeMode,
            userId: args.callerUserId,
            conversationId: args.conversationId,
            debugJson: args.debugJson,
            createdAt: Date.now(),
        });
    },
});

export const getByConversation = query({
    args: {
        conversationId: v.id('conversations'),
        callerUserId: v.string(),
    },
    handler: async (ctx, args) => {
        // Verify ownership
        const conversation = await ctx.db.get(args.conversationId);
        if (!conversation || String(conversation.userId) !== args.callerUserId) {
            return [];
        }

        return await ctx.db
            .query('debugTraces')
            .withIndex('by_conversationId', (q) => q.eq('conversationId', args.conversationId))
            .order('desc')
            .collect();
    },
});

export const getByTraceId = query({
    args: {
        traceId: v.string(),
        callerUserId: v.string(),
    },
    handler: async (ctx, args) => {
        const trace = await ctx.db
            .query('debugTraces')
            .withIndex('by_traceId', (q) => q.eq('traceId', args.traceId))
            .first();

        // Verify ownership via userId stored on the trace
        if (!trace || trace.userId !== args.callerUserId) {
            return null;
        }

        return trace;
    },
});
