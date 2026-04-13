import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthenticatedUser } from './lib/auth';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all timeline candidates for the authenticated user, newest first. */
export const listByUser = query({
    args: {},
    handler: async (ctx) => {
        const user = await getAuthenticatedUser(ctx);
        return ctx.db
            .query('timelineCandidates')
            .withIndex('by_userId', (q) => q.eq('userId', user._id))
            .order('desc')
            .collect();
    },
});

/** List timeline candidates filtered by status for the authenticated user. */
export const listByStatus = query({
    args: {
        status: v.union(v.literal('candidate'), v.literal('confirmed')),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        return ctx.db
            .query('timelineCandidates')
            .withIndex('by_userId_status', (q) =>
                q.eq('userId', user._id).eq('status', args.status)
            )
            .order('desc')
            .collect();
    },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create a timeline candidate. Returns existing ID if requestId matches (scoped to user). */
export const create = mutation({
    args: {
        title: v.string(),
        description: v.string(),
        caseId: v.optional(v.id('cases')),
        eventDate: v.optional(v.string()),
        tags: v.optional(v.array(v.string())),
        sourceMessageId: v.optional(v.id('messages')),
        sourceConversationId: v.optional(v.id('conversations')),
        linkedIncidentId: v.optional(v.id('incidents')),
        requestId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        // Idempotency — scoped to this user
        if (args.requestId) {
            const existing = await ctx.db
                .query('timelineCandidates')
                .withIndex('by_userId_requestId', (q) =>
                    q.eq('userId', user._id).eq('requestId', args.requestId)
                )
                .first();
            if (existing) return existing._id;
        }

        const now = Date.now();
        return ctx.db.insert('timelineCandidates', {
            userId: user._id,
            caseId: args.caseId,
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

/** Confirm a timeline candidate (with ownership verification). */
export const confirm = mutation({
    args: { candidateId: v.id('timelineCandidates') },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const candidate = await ctx.db.get(args.candidateId);
        if (!candidate || candidate.userId !== user._id) {
            throw new Error('Not authorized to modify this timeline candidate');
        }
        await ctx.db.patch(args.candidateId, {
            status: 'confirmed',
            updatedAt: Date.now(),
        });
    },
});

/** Delete a timeline candidate (with ownership verification). */
export const remove = mutation({
    args: { candidateId: v.id('timelineCandidates') },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const candidate = await ctx.db.get(args.candidateId);
        if (!candidate || candidate.userId !== user._id) {
            throw new Error('Not authorized to delete this timeline candidate');
        }
        await ctx.db.delete(args.candidateId);
    },
});
