import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

/** Pinnable type validator (matches schema). */
const pinnableTypeValidator = v.union(
    v.literal('key_fact'),
    v.literal('strategy_point'),
    v.literal('good_faith_point'),
    v.literal('strength_highlight'),
    v.literal('risk_concern'),
    v.literal('hearing_prep_point'),
    v.literal('draft_snippet'),
    v.literal('question_to_verify'),
    v.literal('timeline_anchor')
);

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all pins for the authenticated user, newest first. */
export const listByUser = query({
    args: { userId: v.id('users') },
    handler: async (ctx, args) => {
        return ctx.db
            .query('casePins')
            .withIndex('by_userId', (q) => q.eq('userId', args.userId))
            .order('desc')
            .collect();
    },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create a new pin. Returns existing ID if requestId already exists (idempotent). */
export const create = mutation({
    args: {
        userId: v.id('users'),
        type: pinnableTypeValidator,
        title: v.string(),
        content: v.string(),
        sourceMessageId: v.optional(v.id('messages')),
        sourceConversationId: v.optional(v.id('conversations')),
        requestId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Idempotency check
        if (args.requestId) {
            const existing = await ctx.db
                .query('casePins')
                .withIndex('by_requestId', (q) => q.eq('requestId', args.requestId))
                .first();
            if (existing) return existing._id;
        }

        // Get current max sort order
        const pins = await ctx.db
            .query('casePins')
            .withIndex('by_userId', (q) => q.eq('userId', args.userId))
            .collect();
        const maxOrder = pins.reduce((max, p) => Math.max(max, p.sortOrder ?? 0), 0);

        return ctx.db.insert('casePins', {
            userId: args.userId,
            type: args.type,
            title: args.title,
            content: args.content,
            sourceMessageId: args.sourceMessageId,
            sourceConversationId: args.sourceConversationId,
            requestId: args.requestId,
            sortOrder: maxOrder + 1,
            createdAt: Date.now(),
        });
    },
});

/** Remove a pin by ID. */
export const remove = mutation({
    args: { pinId: v.id('casePins') },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.pinId);
    },
});

/** Update sort order for a pin (for drag-and-drop reordering). */
export const updateSortOrder = mutation({
    args: {
        pinId: v.id('casePins'),
        sortOrder: v.number(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.pinId, { sortOrder: args.sortOrder });
    },
});
