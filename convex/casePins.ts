import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthenticatedUser } from './lib/auth';

/**
 * Pinnable type validator (must match `PinnableType` in `src/lib/integration/types.ts`).
 *
 * Intentionally duplicated: Convex validators run on the server and cannot import
 * TypeScript types from the Next.js app. Keep both lists in sync manually.
 */
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

/** AI confidence level validator. */
const confidenceValidator = v.union(
    v.literal('low'),
    v.literal('medium'),
    v.literal('high')
);

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all pins for the authenticated user, sorted by rail order (sortOrder ascending). */
export const listByUser = query({
    args: {},
    handler: async (ctx) => {
        const user = await getAuthenticatedUser(ctx);
        const pins = await ctx.db
            .query('casePins')
            .withIndex('by_userId', (q) => q.eq('userId', user._id))
            .collect();

        return pins.sort(
            (a, b) =>
                (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
                b.createdAt - a.createdAt
        );
    },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create a new pin. Returns existing ID if requestId already exists (idempotent). */
export const create = mutation({
    args: {
        type: pinnableTypeValidator,
        title: v.string(),
        content: v.string(),
        caseId: v.optional(v.id('cases')),
        sourceMessageId: v.optional(v.id('messages')),
        sourceConversationId: v.optional(v.id('conversations')),
        requestId: v.optional(v.string()),
        /** Original unformatted source text (pre-AI cleanup) */
        rawSourceText: v.optional(v.string()),
        /** AI confidence level in the autofill quality */
        confidence: v.optional(confidenceValidator),
        /** Detected date from source text (ISO string) */
        detectedDate: v.optional(v.string()),
        /** AI formatter version for traceability */
        aiVersion: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        // Idempotency check — scoped to this user
        if (args.requestId) {
            const existing = await ctx.db
                .query('casePins')
                .withIndex('by_userId_requestId', (q) =>
                    q.eq('userId', user._id).eq('requestId', args.requestId)
                )
                .first();
            if (existing) return existing._id;
        }

        // Get current max sort order
        const pins = await ctx.db
            .query('casePins')
            .withIndex('by_userId', (q) => q.eq('userId', user._id))
            .collect();
        const maxOrder = pins.reduce((max, p) => Math.max(max, p.sortOrder ?? 0), 0);

        return ctx.db.insert('casePins', {
            userId: user._id,
            caseId: args.caseId,
            type: args.type,
            title: args.title,
            content: args.content,
            sourceMessageId: args.sourceMessageId,
            sourceConversationId: args.sourceConversationId,
            requestId: args.requestId,
            sortOrder: maxOrder + 1,
            rawSourceText: args.rawSourceText,
            confidence: args.confidence,
            detectedDate: args.detectedDate,
            aiVersion: args.aiVersion,
            createdAt: Date.now(),
        });
    },
});

/** Remove a pin by ID (with ownership verification). */
export const remove = mutation({
    args: { pinId: v.id('casePins') },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const pin = await ctx.db.get(args.pinId);
        if (!pin || pin.userId !== user._id) {
            throw new Error('Not authorized to delete this pin');
        }
        await ctx.db.delete(args.pinId);
    },
});

/** Update sort order for a pin (with ownership verification). */
export const updateSortOrder = mutation({
    args: {
        pinId: v.id('casePins'),
        sortOrder: v.number(),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const pin = await ctx.db.get(args.pinId);
        if (!pin || pin.userId !== user._id) {
            throw new Error('Not authorized to modify this pin');
        }
        await ctx.db.patch(args.pinId, { sortOrder: args.sortOrder });
    },
});
