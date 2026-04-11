import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

/** Save-type validator (matches schema). */
const saveTypeValidator = v.union(
    v.literal('case_note'),
    v.literal('key_fact'),
    v.literal('strategy_point'),
    v.literal('risk_concern'),
    v.literal('strength_highlight'),
    v.literal('good_faith_point'),
    v.literal('draft_snippet'),
    v.literal('timeline_candidate'),
    v.literal('incident_note'),
    v.literal('exhibit_note'),
    v.literal('procedure_note'),
    v.literal('question_to_verify')
);

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all case memory items for the user, newest first. */
export const listByUser = query({
    args: { userId: v.id('users') },
    handler: async (ctx, args) => {
        return ctx.db
            .query('caseMemory')
            .withIndex('by_userId', (q) => q.eq('userId', args.userId))
            .order('desc')
            .collect();
    },
});

/** List case memory items filtered by type. */
export const listByType = query({
    args: {
        userId: v.id('users'),
        type: saveTypeValidator,
    },
    handler: async (ctx, args) => {
        return ctx.db
            .query('caseMemory')
            .withIndex('by_userId_type', (q) =>
                q.eq('userId', args.userId).eq('type', args.type)
            )
            .order('desc')
            .collect();
    },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Save an item to case memory. Returns existing ID if requestId matches (idempotent). */
export const save = mutation({
    args: {
        userId: v.id('users'),
        type: saveTypeValidator,
        title: v.string(),
        content: v.string(),
        metadataJson: v.optional(v.string()),
        sourceMessageId: v.optional(v.id('messages')),
        sourceConversationId: v.optional(v.id('conversations')),
        requestId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Idempotency
        if (args.requestId) {
            const existing = await ctx.db
                .query('caseMemory')
                .withIndex('by_requestId', (q) => q.eq('requestId', args.requestId))
                .first();
            if (existing) return existing._id;
        }

        const now = Date.now();
        return ctx.db.insert('caseMemory', {
            userId: args.userId,
            type: args.type,
            title: args.title,
            content: args.content,
            metadataJson: args.metadataJson,
            sourceMessageId: args.sourceMessageId,
            sourceConversationId: args.sourceConversationId,
            requestId: args.requestId,
            createdAt: now,
            updatedAt: now,
        });
    },
});

/** Update a case memory item's content. */
export const update = mutation({
    args: {
        itemId: v.id('caseMemory'),
        title: v.optional(v.string()),
        content: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const updates: Record<string, unknown> = { updatedAt: Date.now() };
        if (args.title !== undefined) updates.title = args.title;
        if (args.content !== undefined) updates.content = args.content;
        await ctx.db.patch(args.itemId, updates);
    },
});

/** Delete a case memory item. */
export const remove = mutation({
    args: { itemId: v.id('caseMemory') },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.itemId);
    },
});
