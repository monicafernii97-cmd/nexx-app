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
 *
 * Convex uses optimistic concurrency control (OCC): mutations run against
 * a consistent snapshot. If two concurrent calls both read "no case exists"
 * and attempt to insert, Convex detects the read/write conflict and retries
 * the losing mutation — which will then see the first insert and return it.
 * A client-side `provisioningRef` guard further prevents double-fire.
 */
export const getOrCreateDefault = mutation({
    args: {},
    handler: async (ctx) => {
        const user = await getAuthenticatedUser(ctx);

        // Check for any existing case — if found, return it immediately
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
        return (await ctx.db.get(id))!;
    },
});

/** Create a new case (for the "+ Add Case" flow).
 *
 * Enforces single-active semantics: archives all previously active cases
 * for this user before inserting the new one as 'active'. This ensures
 * `resolvedActiveCaseId` falls back to the correct case on page reload.
 */
export const create = mutation({
    args: {
        title: v.string(),
        description: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        // Archive all currently active cases for this user
        const activeCases = await ctx.db
            .query('cases')
            .withIndex('by_userId', (q) => q.eq('userId', user._id))
            .collect();
        for (const c of activeCases) {
            if (c.status === 'active') {
                await ctx.db.patch(c._id, { status: 'archived', updatedAt: Date.now() });
            }
        }

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
