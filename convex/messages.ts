import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUserAndConversation } from './lib/auth';
/** ── Mutations ── */

/** Send a message — auth-guarded */
export const send = mutation({
    args: {
        conversationId: v.id('conversations'),
        role: v.union(v.literal('user'), v.literal('assistant')),
        content: v.string(),
        metadata: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        await getAuthenticatedUserAndConversation(ctx, args.conversationId);

        const messageId = await ctx.db.insert('messages', {
            conversationId: args.conversationId,
            role: args.role,
            content: args.content,
            metadata: args.metadata,
            createdAt: Date.now(),
        });

        // Update conversation's lastMessageAt and increment messageCount
        const conversation = await ctx.db.get(args.conversationId);
        await ctx.db.patch(args.conversationId, {
            lastMessageAt: Date.now(),
            messageCount: (conversation?.messageCount ?? 0) + 1,
        });

        return messageId;
    },
});

/** List messages for a conversation — auth-guarded */
export const list = query({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
        if (!user) return [];

        // Verify conversation ownership
        const conversation = await ctx.db.get(args.conversationId);
        if (!conversation || conversation.userId !== user._id) {
            return [];
        }

        return await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) =>
                q.eq('conversationId', args.conversationId)
            )
            .order('asc')
            .collect();
    },
});
