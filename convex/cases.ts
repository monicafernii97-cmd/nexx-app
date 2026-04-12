import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthenticatedUser } from './lib/auth';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all cases for the authenticated user, newest first. */
export const list = query({
    args: {},
    handler: async (ctx) => {
        const user = await getAuthenticatedUser(ctx);
        return ctx.db
            .query('cases')
            .withIndex('by_userId', (q) => q.eq('userId', user._id))
            .order('desc')
            .collect();
    },
});

/**
 * Get or create a default case for the authenticated user.
 *
 * This is the "zero-friction" entry point — every user automatically gets
 * a "My Case" the first time the workspace loads. No onboarding modal,
 * no extra steps. Multi-case support simply reveals the switcher later.
 */
export const getOrCreateDefault = mutation({
    args: {},
    handler: async (ctx) => {
        const user = await getAuthenticatedUser(ctx);

        // Check for an existing case
        const existing = await ctx.db
            .query('cases')
            .withIndex('by_userId', (q) => q.eq('userId', user._id))
            .first();
        if (existing) return existing;

        // First-time user — create the default case
        const now = Date.now();
        const id = await ctx.db.insert('cases', {
            userId: user._id,
            title: 'My Case',
            description: '',
            status: 'active',
            createdAt: now,
            updatedAt: now,
        });

        // Idempotent guard: if a concurrent mutation already created a case,
        // return the earliest one and remove the duplicate we just inserted.
        const allCases = await ctx.db
            .query('cases')
            .withIndex('by_userId', (q) => q.eq('userId', user._id))
            .collect();

        if (allCases.length > 1) {
            // Keep the oldest (lowest createdAt), remove the one we just made
            const sorted = [...allCases].sort((a, b) => a.createdAt - b.createdAt);
            for (const dup of sorted.slice(1)) {
                await ctx.db.delete(dup._id);
            }
            return sorted[0];
        }

        return (await ctx.db.get(id))!;
    },
});

/** Create a new case (for the "+ Add Case" flow). */
export const create = mutation({
    args: {
        title: v.string(),
        description: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const now = Date.now();
        return ctx.db.insert('cases', {
            userId: user._id,
            title: args.title,
            description: args.description ?? '',
            status: 'active',
            createdAt: now,
            updatedAt: now,
        });
    },
});

/** Update a case's title or description (with ownership check). */
export const update = mutation({
    args: {
        caseId: v.id('cases'),
        title: v.optional(v.string()),
        description: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const existing = await ctx.db.get(args.caseId);
        if (!existing || existing.userId !== user._id) {
            throw new Error('Not authorized to modify this case');
        }
        const updates: Record<string, unknown> = { updatedAt: Date.now() };
        if (args.title !== undefined) updates.title = args.title;
        if (args.description !== undefined) updates.description = args.description;
        await ctx.db.patch(args.caseId, updates);
    },
});
