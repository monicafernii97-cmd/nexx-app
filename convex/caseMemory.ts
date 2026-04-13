import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthenticatedUser } from './lib/auth';

/**
 * Save-type validator (must match `SaveType` in `src/lib/ui-intelligence/types.ts`).
 *
 * Intentionally duplicated: Convex validators run on the server and cannot import
 * TypeScript types from the Next.js app. Keep both lists in sync manually.
 */
const saveTypeValidator = v.union(
    v.literal('case_note'),
    v.literal('key_fact'),
    v.literal('strategy_point'),
    v.literal('risk_concern'),
    v.literal('strength_highlight'),
    v.literal('good_faith_point'),
    v.literal('draft_snippet'),
    v.literal('hearing_prep_point'),
    v.literal('timeline_candidate'),
    v.literal('incident_note'),
    v.literal('exhibit_note'),
    v.literal('procedure_note'),
    v.literal('question_to_verify')
);

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all case memory items for the authenticated user, newest first. */
export const listByUser = query({
    args: {},
    handler: async (ctx) => {
        const user = await getAuthenticatedUser(ctx);
        return ctx.db
            .query('caseMemory')
            .withIndex('by_userId', (q) => q.eq('userId', user._id))
            .order('desc')
            .collect();
    },
});

/** List case memory items filtered by type for the authenticated user. */
export const listByType = query({
    args: { type: saveTypeValidator },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        return ctx.db
            .query('caseMemory')
            .withIndex('by_userId_type', (q) =>
                q.eq('userId', user._id).eq('type', args.type)
            )
            .order('desc')
            .collect();
    },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Save an item to case memory. Returns existing ID if requestId matches (idempotent, scoped to user). */
export const save = mutation({
    args: {
        type: saveTypeValidator,
        title: v.string(),
        content: v.string(),
        caseId: v.optional(v.id('cases')),
        metadataJson: v.optional(v.string()),
        sourceMessageId: v.optional(v.id('messages')),
        sourceConversationId: v.optional(v.id('conversations')),
        requestId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        // Idempotency — scoped to this user
        if (args.requestId) {
            const existing = await ctx.db
                .query('caseMemory')
                .withIndex('by_userId_requestId', (q) =>
                    q.eq('userId', user._id).eq('requestId', args.requestId)
                )
                .first();
            if (existing) return existing._id;
        }

        const now = Date.now();
        return ctx.db.insert('caseMemory', {
            userId: user._id,
            caseId: args.caseId,
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

/** Update a case memory item's content (with ownership verification). */
export const update = mutation({
    args: {
        itemId: v.id('caseMemory'),
        title: v.optional(v.string()),
        content: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const item = await ctx.db.get(args.itemId);
        if (!item || item.userId !== user._id) {
            throw new Error('Not authorized to modify this item');
        }
        const updates: Record<string, unknown> = { updatedAt: Date.now() };
        if (args.title !== undefined) updates.title = args.title;
        if (args.content !== undefined) updates.content = args.content;
        await ctx.db.patch(args.itemId, updates);
    },
});

/** Delete a case memory item (with ownership verification). */
export const remove = mutation({
    args: { itemId: v.id('caseMemory') },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const item = await ctx.db.get(args.itemId);
        if (!item || item.userId !== user._id) {
            throw new Error('Not authorized to delete this item');
        }
        await ctx.db.delete(args.itemId);
    },
});
