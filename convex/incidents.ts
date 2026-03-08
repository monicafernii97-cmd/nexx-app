import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// Create a new incident
export const create = mutation({
    args: {
        userId: v.id('users'),
        narrative: v.string(),
        courtSummary: v.optional(v.string()),
        category: v.string(),
        severity: v.number(),
        date: v.string(),
        time: v.string(),
        aiAnalysis: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const incidentId = await ctx.db.insert('incidents', {
            userId: args.userId,
            narrative: args.narrative,
            courtSummary: args.courtSummary,
            category: args.category,
            severity: args.severity,
            date: args.date,
            time: args.time,
            aiAnalysis: args.aiAnalysis,
            status: 'draft',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        return incidentId;
    },
});

// List incidents for a user
export const list = query({
    args: { userId: v.id('users') },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('incidents')
            .withIndex('by_user', (q) => q.eq('userId', args.userId))
            .order('desc')
            .collect();
    },
});

// Get a single incident
export const get = query({
    args: { id: v.id('incidents') },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});

// Update an incident
export const update = mutation({
    args: {
        id: v.id('incidents'),
        narrative: v.optional(v.string()),
        courtSummary: v.optional(v.string()),
        category: v.optional(v.string()),
        severity: v.optional(v.number()),
        date: v.optional(v.string()),
        time: v.optional(v.string()),
        aiAnalysis: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const { id, ...updates } = args;
        const filtered = Object.fromEntries(
            Object.entries(updates).filter(([_, v]) => v !== undefined)
        );
        await ctx.db.patch(id, { ...filtered, updatedAt: Date.now() });
    },
});

// Confirm an incident (mark as finalized)
export const confirm = mutation({
    args: { id: v.id('incidents') },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, {
            status: 'confirmed',
            updatedAt: Date.now(),
        });
    },
});
