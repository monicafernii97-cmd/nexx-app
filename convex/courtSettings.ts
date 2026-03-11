import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUser } from './lib/auth';

// ── Mutations ──

/** Create or update court settings for the authenticated user. */
export const upsert = mutation({
    args: {
        state: v.string(),
        county: v.string(),
        courtName: v.optional(v.string()),
        judicialDistrict: v.optional(v.string()),
        assignedJudge: v.optional(v.string()),
        causeNumber: v.optional(v.string()),
        formattingOverrides: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const now = Date.now();

        // Check if user already has settings
        const existing = await ctx.db
            .query('userCourtSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .first();

        if (existing) {
            // Update existing — reset AI verification since settings changed
            await ctx.db.patch(existing._id, {
                ...args,
                aiVerified: false,
                aiVerifiedAt: undefined,
                updatedAt: now,
            });
            return existing._id;
        }

        // Create new
        return await ctx.db.insert('userCourtSettings', {
            userId: user._id,
            ...args,
            createdAt: now,
            updatedAt: now,
        });
    },
});

/**
 * Mark court settings as NEXXverified.
 * Auth-guarded — only the settings owner can mark as verified.
 * Called server-side by the court-rules lookup API route after
 * actual AI verification succeeds.
 */
export const markNEXXverified = mutation({
    args: {
        id: v.id('userCourtSettings'),
        formattingOverrides: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const settings = await ctx.db.get(args.id);
        if (!settings || settings.userId !== user._id) {
            throw new Error('Not authorized');
        }

        const now = Date.now();
        await ctx.db.patch(args.id, {
            aiVerified: true,
            aiVerifiedAt: now,
            ...(args.formattingOverrides ? { formattingOverrides: args.formattingOverrides } : {}),
            updatedAt: now,
        });
    },
});

/** Delete court settings. */
export const remove = mutation({
    args: { id: v.id('userCourtSettings') },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const settings = await ctx.db.get(args.id);
        if (!settings || settings.userId !== user._id) {
            throw new Error('Not authorized');
        }

        await ctx.db.delete(args.id);
    },
});

/** Grant server-side consent for AI compliance checking. */
export const grantComplianceConsent = mutation({
    args: {},
    handler: async (ctx) => {
        const user = await getAuthenticatedUser(ctx);

        const settings = await ctx.db
            .query('userCourtSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .first();

        if (!settings) {
            throw new Error('No court settings found. Save your court settings first.');
        }

        const now = Date.now();
        await ctx.db.patch(settings._id, {
            complianceConsentGrantedAt: now,
            updatedAt: now,
        });
    },
});

// ── Queries ──

/** Get the authenticated user's court settings. */
export const get = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
        if (!user) return null;

        return await ctx.db
            .query('userCourtSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .first();
    },
});

/**
 * Check if the authenticated user has granted compliance consent.
 * Uses ctx.auth to derive the user — no caller-supplied IDs.
 */
export const hasComplianceConsent = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return false;

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
        if (!user) return false;

        const settings = await ctx.db
            .query('userCourtSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .first();

        return !!settings?.complianceConsentGrantedAt;
    },
});
