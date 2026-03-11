import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUser } from './lib/auth';

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
        category: categoryValidator,
        severity: v.number(),
        date: v.string(),
        time: v.string(),
        witnesses: v.optional(v.array(v.string())),
        evidence: v.optional(v.array(v.string())),
        location: v.optional(v.string()),
        childrenInvolved: v.optional(v.boolean()),
        aiAnalysis: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        return await ctx.db.insert('incidents', {
            userId: user._id,
            narrative: args.narrative,
            courtSummary: args.courtSummary,
            category: args.category,
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
        });
    },
});

/** List incidents for the authenticated user */
export const list = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
        if (!user) return [];

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
