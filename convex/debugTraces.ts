import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUser, getAuthenticatedUserAndConversation } from './lib/auth';

/**
 * Debug Traces — auditability for every AI call.
 * Each trace captures the full lifecycle: request → generation → validation → recovery → outcome.
 * The debugJson field stores the serialized NexxTrace object.
 *
 * Auth: server-derived via ctx.auth (Clerk JWT). Not caller-supplied.
 * clerkUserId is recorded for audit — resolved from the auth context.
 */

export const create = mutation({
    args: {
        traceId: v.string(),
        route: v.string(),
        routeMode: v.string(),
        conversationId: v.optional(v.id('conversations')),
        debugJson: v.string(),
    },
    handler: async (ctx, args) => {
        // Server-derived auth
        const user = await getAuthenticatedUser(ctx);
        if (!user.clerkId) {
            throw new Error('Authenticated user is missing clerkId');
        }
        const clerkUserId = user.clerkId;

        // Verify conversation ownership if provided
        if (args.conversationId) {
            await getAuthenticatedUserAndConversation(ctx, args.conversationId);
        }

        return await ctx.db.insert('debugTraces', {
            traceId: args.traceId,
            route: args.route,
            routeMode: args.routeMode,
            clerkUserId,
            conversationId: args.conversationId,
            debugJson: args.debugJson,
            createdAt: Date.now(),
        });
    },
});

export const getByConversation = query({
    args: {
        conversationId: v.id('conversations'),
    },
    handler: async (ctx, args) => {
        // Server-derived auth
        await getAuthenticatedUserAndConversation(ctx, args.conversationId);

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
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const trace = await ctx.db
            .query('debugTraces')
            .withIndex('by_traceId', (q) => q.eq('traceId', args.traceId))
            .first();

        // Verify ownership via clerkUserId stored on the trace
        if (!trace || trace.clerkUserId !== user.clerkId) {
            return null;
        }

        return trace;
    },
});
