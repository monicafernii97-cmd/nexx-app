import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Retrieved Sources — legal sources retrieved per conversation.
 * Stored for auditability: which sources were used to inform which responses.
 *
 * Ownership: all endpoints verify callerUserId owns the conversation.
 */

export const create = mutation({
    args: {
        conversationId: v.id('conversations'),
        title: v.string(),
        url: v.string(),
        sourceType: v.string(),
        snippet: v.string(),
        callerUserId: v.string(),
    },
    handler: async (ctx, args) => {
        // Verify conversation ownership
        const conversation = await ctx.db.get(args.conversationId);
        if (!conversation) throw new Error('Conversation not found');
        if (String(conversation.userId) !== args.callerUserId) {
            throw new Error('Unauthorized: caller does not own this conversation');
        }

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
        callerUserId: v.string(),
    },
    handler: async (ctx, args) => {
        // Verify ownership
        const conversation = await ctx.db.get(args.conversationId);
        if (!conversation || String(conversation.userId) !== args.callerUserId) {
            return [];
        }

        return await ctx.db
            .query('retrievedSources')
            .withIndex('by_conversationId', (q) => q.eq('conversationId', args.conversationId))
            .order('desc')
            .collect();
    },
});
