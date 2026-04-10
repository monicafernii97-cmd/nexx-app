import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUserAndConversation } from './lib/auth';

/**
 * Retrieved Sources — legal sources retrieved per conversation.
 * Stored for auditability: which sources were used to inform which responses.
 *
 * Auth: server-derived via ctx.auth (Clerk JWT). Not caller-supplied.
 */

export const create = mutation({
    args: {
        conversationId: v.id('conversations'),
        title: v.string(),
        url: v.string(),
        sourceType: v.string(),
        snippet: v.string(),
    },
    handler: async (ctx, args) => {
        // Server-derived auth
        await getAuthenticatedUserAndConversation(ctx, args.conversationId);

        return await ctx.db.insert('retrievedSources', {
            conversationId: args.conversationId,
            title: args.title,
            url: args.url,
            sourceType: args.sourceType,
            snippet: args.snippet,
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
            .query('retrievedSources')
            .withIndex('by_conversationId', (q) => q.eq('conversationId', args.conversationId))
            .order('desc')
            .collect();
    },
});
