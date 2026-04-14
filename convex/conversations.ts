import { mutation, query, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { getAuthenticatedUser } from './lib/auth';

/** Create a new conversation — auth-guarded */
export const create = mutation({
    args: {
        title: v.string(),
        mode: v.union(
            v.literal('therapeutic'),
            v.literal('legal'),
            v.literal('strategic'),
            v.literal('general')
        ),
        caseId: v.optional(v.id('cases')),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        return await ctx.db.insert('conversations', {
            userId: user._id,
            title: args.title,
            mode: args.mode,
            status: 'active',
            messageCount: 0,
            lastMessageAt: Date.now(),
            createdAt: Date.now(),
            caseId: args.caseId,
        });
    },
});

/** Update conversation title — auth-guarded */
export const updateTitle = mutation({
    args: {
        id: v.id('conversations'),
        title: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const conversation = await ctx.db.get(args.id);
        if (!conversation || conversation.userId !== user._id) {
            throw new Error('Not authorized to update this conversation');
        }

        await ctx.db.patch(args.id, { title: args.title });
    },
});

/** Archive a conversation — auth-guarded */
export const archive = mutation({
    args: { id: v.id('conversations') },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const conversation = await ctx.db.get(args.id);
        if (!conversation || conversation.userId !== user._id) {
            throw new Error('Not authorized to archive this conversation');
        }

        await ctx.db.patch(args.id, { status: 'archived' as const });
    },
});

/** Delete a conversation and all its messages — auth-guarded */
export const remove = mutation({
    args: { id: v.id('conversations') },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const conversation = await ctx.db.get(args.id);
        if (!conversation || conversation.userId !== user._id) {
            throw new Error('Not authorized to delete this conversation');
        }

        // Schedule batched message deletion (avoids Convex mutation limits).
        // The conversation itself is deleted only after all messages are gone,
        // preventing orphaned messages if a scheduled job fails.
        await ctx.scheduler.runAfter(0, internal.conversations.deleteMessagesBatch, {
            conversationId: args.id,
            deleteConversation: true,
        });
    },
});

/** Delete messages in batches to stay within Convex mutation limits. */
const BATCH_SIZE = 500;

export const deleteMessagesBatch = internalMutation({
    args: {
        conversationId: v.id('conversations'),
        deleteConversation: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const batch = await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
            .take(BATCH_SIZE);

        for (const msg of batch) {
            await ctx.db.delete(msg._id);
        }

        if (batch.length === BATCH_SIZE) {
            // More messages remain — schedule continuation
            await ctx.scheduler.runAfter(0, internal.conversations.deleteMessagesBatch, {
                conversationId: args.conversationId,
                deleteConversation: args.deleteConversation,
            });
        } else if (args.deleteConversation) {
            // All messages deleted — now safe to remove the conversation
            const conversation = await ctx.db.get(args.conversationId);
            if (conversation) {
                await ctx.db.delete(args.conversationId);
            }
        }
    },
});

/** ── Queries ── */

/** List conversations for the authenticated user */
export const list = query({
    args: {
        status: v.optional(
            v.union(v.literal('active'), v.literal('archived'))
        ),
        caseId: v.optional(v.id('cases')),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
        if (!user) return [];

        // Case-scoped query when caseId is provided
        if (args.caseId) {
            const results = await ctx.db
                .query('conversations')
                .withIndex('by_user_case', (q) =>
                    q.eq('userId', user._id).eq('caseId', args.caseId!)
                )
                .order('desc')
                .collect();
            // Filter by status client-side when using case index
            if (args.status) {
                return results.filter((c) => c.status === args.status);
            }
            return results;
        }

        if (args.status) {
            return await ctx.db
                .query('conversations')
                .withIndex('by_user_status', (q) =>
                    q.eq('userId', user._id).eq('status', args.status!)
                )
                .order('desc')
                .collect();
        }

        return await ctx.db
            .query('conversations')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .order('desc')
            .collect();
    },
});

/** Get a single conversation — auth-guarded */
export const get = query({
    args: { id: v.id('conversations') },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('Not authenticated');

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
        if (!user) throw new Error('User not found');

        const conversation = await ctx.db.get(args.id);
        if (!conversation || conversation.userId !== user._id) {
            throw new Error('Not authorized');
        }
        return conversation;
    },
});

// ── NEW: Responses API + Conversations API state management ──
// All mutations below derive the caller from ctx.auth (Clerk JWT),
// NOT from caller-supplied args. This prevents forgery.

import { getAuthenticatedUserAndConversation } from './lib/auth';

/** Set the OpenAI Conversations API state on a conversation (called from the chat API route). */
export const setOpenAIConversationState = mutation({
    args: {
        conversationId: v.id('conversations'),
        openaiConversationId: v.string(),
        openaiLastResponseId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await getAuthenticatedUserAndConversation(ctx, args.conversationId);
        await ctx.db.patch(args.conversationId, {
            openaiConversationId: args.openaiConversationId,
            openaiLastResponseId: args.openaiLastResponseId,
            lastMessageAt: Date.now(),
        });
    },
});

/** Update the last response ID (for auditability / fallback chaining). */
export const setLastResponseId = mutation({
    args: {
        conversationId: v.id('conversations'),
        openaiLastResponseId: v.string(),
    },
    handler: async (ctx, args) => {
        await getAuthenticatedUserAndConversation(ctx, args.conversationId);
        await ctx.db.patch(args.conversationId, {
            openaiLastResponseId: args.openaiLastResponseId,
            lastMessageAt: Date.now(),
        });
    },
});

/** Update the route mode on a conversation (set by the router each turn). */
export const setRouteMode = mutation({
    args: {
        conversationId: v.id('conversations'),
        routeMode: v.union(
            v.literal('adaptive_chat'),
            v.literal('direct_legal_answer'),
            v.literal('local_procedure'),
            v.literal('document_analysis'),
            v.literal('judge_lens_strategy'),
            v.literal('court_ready_drafting'),
            v.literal('pattern_analysis'),
            v.literal('support_grounding'),
            v.literal('safety_escalation')
        ),
    },
    handler: async (ctx, args) => {
        await getAuthenticatedUserAndConversation(ctx, args.conversationId);
        await ctx.db.patch(args.conversationId, {
            routeMode: args.routeMode,
        });
    },
});

/** Persist the vector store ID for file search on a conversation. */
export const setVectorStoreId = mutation({
    args: {
        conversationId: v.id('conversations'),
        vectorStoreId: v.string(),
    },
    handler: async (ctx, args) => {
        await getAuthenticatedUserAndConversation(ctx, args.conversationId);
        await ctx.db.patch(args.conversationId, {
            vectorStoreId: args.vectorStoreId,
        });
    },
});

/**
 * Atomically set vectorStoreId only if not already present (compare-and-set).
 * 
 * Pattern: "create-then-persist" — the caller creates the external store FIRST,
 * then calls this to persist. If another thread already persisted one,
 * this returns the winner's ID so the caller can clean up its orphan.
 */
export const compareAndSetVectorStoreId = mutation({
    args: {
        conversationId: v.id('conversations'),
        candidateId: v.string(),
    },
    handler: async (ctx, args) => {
        const { conversation } = await getAuthenticatedUserAndConversation(ctx, args.conversationId);
        if (conversation.vectorStoreId) {
            // Another thread won — return the winner's ID
            return { vectorStoreId: conversation.vectorStoreId, wasSet: false };
        }
        await ctx.db.patch(args.conversationId, {
            vectorStoreId: args.candidateId,
        });
        return { vectorStoreId: args.candidateId, wasSet: true };
    },
});

/**
 * Atomically set openaiConversationId only if not already present (compare-and-set).
 * 
 * Pattern: "create-then-persist" — the caller creates the OpenAI conversation
 * FIRST, then calls this to persist. If another thread already persisted one,
 * this returns the winner's ID so the caller uses the correct thread and
 * the loser's orphan is harmless (empty OpenAI conversation, no data lost).
 */
export const getOrSetOpenAIConversationId = mutation({
    args: {
        conversationId: v.id('conversations'),
        candidateOpenAIId: v.string(),
        openaiLastResponseId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const { conversation } = await getAuthenticatedUserAndConversation(ctx, args.conversationId);
        if (conversation.openaiConversationId) {
            // Another thread won — return the existing ID
            return { openaiConversationId: conversation.openaiConversationId, wasSet: false };
        }
        await ctx.db.patch(args.conversationId, {
            openaiConversationId: args.candidateOpenAIId,
            openaiLastResponseId: args.openaiLastResponseId,
            lastMessageAt: Date.now(),
        });
        return { openaiConversationId: args.candidateOpenAIId, wasSet: true };
    },
});
