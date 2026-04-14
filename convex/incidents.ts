import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUser, validateCaseOwnership } from './lib/auth';

/** Incident category enum — shared across args */
const categoryValidator = v.union(
    v.literal('emotional_abuse'),
    v.literal('financial_abuse'),
    v.literal('parental_alienation'),
    v.literal('custody_violation'),
    v.literal('harassment'),
    v.literal('threats'),
    v.literal('manipulation'),
    v.literal('neglect'),
    v.literal('other')
);

/** ── Helper: incident category enum ── */

/** Create a new incident — auth-guarded */
export const create = mutation({
    args: {
        narrative: v.string(),
        courtSummary: v.optional(v.string()),
        category: v.optional(categoryValidator),
        tags: v.optional(v.array(v.string())),
        severity: v.number(),
        date: v.string(),
        time: v.string(),
        witnesses: v.optional(v.array(v.string())),
        evidence: v.optional(v.array(v.string())),
        location: v.optional(v.string()),
        childrenInvolved: v.optional(v.boolean()),
        aiAnalysis: v.optional(v.string()),
        caseId: v.id('cases'),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        await validateCaseOwnership(ctx, args.caseId, user._id);

        return await ctx.db.insert('incidents', {
            userId: user._id,
            narrative: args.narrative,
            courtSummary: args.courtSummary,
            category: args.category,
            tags: args.tags,
            severity: args.severity,
            date: args.date,
            time: args.time,
            witnesses: args.witnesses,
            evidence: args.evidence,
            location: args.location,
            childrenInvolved: args.childrenInvolved,
            aiAnalysis: args.aiAnalysis,
            status: 'draft',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            caseId: args.caseId,
        });
    },
});

/** List incidents for the authenticated user */
export const list = query({
    args: {
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
            return await ctx.db
                .query('incidents')
                .withIndex('by_user_case', (q) =>
                    q.eq('userId', user._id).eq('caseId', args.caseId!)
                )
                .order('desc')
                .collect();
        }

        return await ctx.db
            .query('incidents')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .order('desc')
            .collect();
    },
});

/** Get a single incident — auth-guarded */
export const get = query({
    args: { id: v.id('incidents') },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('Not authenticated');

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
        if (!user) throw new Error('User not found');

        const incident = await ctx.db.get(args.id);
        if (!incident || incident.userId !== user._id) {
            throw new Error('Not authorized');
        }
        return incident;
    },
});

/** Update an incident — auth-guarded */
export const update = mutation({
    args: {
        id: v.id('incidents'),
        narrative: v.optional(v.string()),
        courtSummary: v.optional(v.string()),
        category: v.optional(categoryValidator),
        tags: v.optional(v.array(v.string())),
        severity: v.optional(v.number()),
        date: v.optional(v.string()),
        time: v.optional(v.string()),
        witnesses: v.optional(v.array(v.string())),
        evidence: v.optional(v.array(v.string())),
        location: v.optional(v.string()),
        childrenInvolved: v.optional(v.boolean()),
        aiAnalysis: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const incident = await ctx.db.get(args.id);
        if (!incident || incident.userId !== user._id) {
            throw new Error('Not authorized to update this incident');
        }

        const { id, ...updates } = args;
        const filtered = Object.fromEntries(
            Object.entries(updates).filter(([, val]) => val !== undefined)
        );
        await ctx.db.patch(id, { ...filtered, updatedAt: Date.now() });
    },
});

/** Confirm an incident (mark as finalized) — auth-guarded */
export const confirm = mutation({
    args: { id: v.id('incidents') },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const incident = await ctx.db.get(args.id);
        if (!incident || incident.userId !== user._id) {
            throw new Error('Not authorized to confirm this incident');
        }

        await ctx.db.patch(args.id, {
            status: 'confirmed' as const,
            updatedAt: Date.now(),
        });
    },
});

/** Delete an incident — auth-guarded */
export const remove = mutation({
    args: { id: v.id('incidents') },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const incident = await ctx.db.get(args.id);
        if (!incident || incident.userId !== user._id) {
            throw new Error('Not authorized to delete this incident');
        }

        await ctx.db.delete(args.id);
    },
});
