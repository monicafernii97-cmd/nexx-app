import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all timeline candidates for the user, newest first. */
export const listByUser = query({
    args: { userId: v.id('users') },
    handler: async (ctx, args) => {
        return ctx.db
            .query('timelineCandidates')
            .withIndex('by_userId', (q) => q.eq('userId', args.userId))
            .order('desc')
            .collect();
    },
});

/** List timeline candidates filtered by status (candidate or confirmed). */
export const listByStatus = query({
    args: {
        userId: v.id('users'),
        status: v.union(v.literal('candidate'), v.literal('confirmed')),
    },
    handler: async (ctx, args) => {
        return ctx.db
            .query('timelineCandidates')
            .withIndex('by_userId_status', (q) =>
                q.eq('userId', args.userId).eq('status', args.status)
            )
            .order('desc')
            .collect();
    },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create a timeline candidate. Returns existing ID if requestId matches. */
export const create = mutation({
    args: {
        userId: v.id('users'),
        title: v.string(),
        description: v.string(),
        eventDate: v.optional(v.string()),
        tags: v.optional(v.array(v.string())),
        sourceMessageId: v.optional(v.id('messages')),
        sourceConversationId: v.optional(v.id('conversations')),
        linkedIncidentId: v.optional(v.id('incidents')),
        requestId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Idempotency
        if (args.requestId) {
            const existing = await ctx.db
                .query('timelineCandidates')
                .withIndex('by_requestId', (q) => q.eq('requestId', args.requestId))
                .first();
            if (existing) return existing._id;
        }

        const now = Date.now();
        return ctx.db.insert('timelineCandidates', {
            userId: args.userId,
            status: 'candidate',
            title: args.title,
            description: args.description,
            eventDate: args.eventDate,
            tags: args.tags,
            sourceMessageId: args.sourceMessageId,
            sourceConversationId: args.sourceConversationId,
            linkedIncidentId: args.linkedIncidentId,
            requestId: args.requestId,
            createdAt: now,
            updatedAt: now,
        });
    },
});

/** Confirm a timeline candidate (user-approved). */
export const confirm = mutation({
    args: { candidateId: v.id('timelineCandidates') },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.candidateId, {
            status: 'confirmed',
            updatedAt: Date.now(),
        });
    },
});

/** Delete a timeline candidate. */
export const remove = mutation({
    args: { candidateId: v.id('timelineCandidates') },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.candidateId);
    },
});
