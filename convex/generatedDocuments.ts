import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUser } from './lib/auth';

// ── Mutations ──

/** Save a newly generated document record. */
export const create = mutation({
    args: {
        templateId: v.string(),
        templateTitle: v.string(),
        caseType: v.string(),
        courtSettingsId: v.optional(v.id('userCourtSettings')),
        storageId: v.optional(v.id('_storage')),
        courtState: v.string(),
        courtCounty: v.string(),
        causeNumber: v.optional(v.string()),
        petitionerName: v.string(),
        respondentName: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const now = Date.now();

        return await ctx.db.insert('generatedDocuments', {
            userId: user._id,
            ...args,
            status: 'draft',
            complianceStatus: 'unchecked',
            createdAt: now,
            updatedAt: now,
        });
    },
});

/** Update document status (draft → final → filed). */
export const updateStatus = mutation({
    args: {
        id: v.id('generatedDocuments'),
        status: v.union(
            v.literal('draft'),
            v.literal('final'),
            v.literal('filed')
        ),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const doc = await ctx.db.get(args.id);
        if (!doc || doc.userId !== user._id) {
            throw new Error('Not authorized');
        }

        await ctx.db.patch(args.id, {
            status: args.status,
            updatedAt: Date.now(),
        });
    },
});

/** Update compliance check results. */
export const updateCompliance = mutation({
    args: {
        id: v.id('generatedDocuments'),
        complianceStatus: v.union(
            v.literal('pass'),
            v.literal('warning'),
            v.literal('fail'),
            v.literal('unchecked')
        ),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const doc = await ctx.db.get(args.id);
        if (!doc || doc.userId !== user._id) {
            throw new Error('Not authorized');
        }

        await ctx.db.patch(args.id, {
            complianceStatus: args.complianceStatus,
            complianceCheckedAt: Date.now(),
            updatedAt: Date.now(),
        });
    },
});

/** Attach a PDF storage ID to a document. */
export const attachPdf = mutation({
    args: {
        id: v.id('generatedDocuments'),
        storageId: v.id('_storage'),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const doc = await ctx.db.get(args.id);
        if (!doc || doc.userId !== user._id) {
            throw new Error('Not authorized');
        }

        await ctx.db.patch(args.id, {
            storageId: args.storageId,
            updatedAt: Date.now(),
        });
    },
});

/** Delete a generated document. */
export const remove = mutation({
    args: { id: v.id('generatedDocuments') },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const doc = await ctx.db.get(args.id);
        if (!doc || doc.userId !== user._id) {
            throw new Error('Not authorized');
        }

        await ctx.db.delete(args.id);
    },
});

// ── Queries ──

/** List generated documents for the authenticated user. */
export const list = query({
    args: {
        status: v.optional(v.union(
            v.literal('draft'),
            v.literal('final'),
            v.literal('filed')
        )),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
        if (!user) return [];

        if (args.status) {
            return await ctx.db
                .query('generatedDocuments')
                .withIndex('by_user_status', (q) =>
                    q.eq('userId', user._id).eq('status', args.status!)
                )
                .order('desc')
                .collect();
        }

        return await ctx.db
            .query('generatedDocuments')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .order('desc')
            .collect();
    },
});

/** Get a single generated document. */
export const get = query({
    args: { id: v.id('generatedDocuments') },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
        if (!user) return null;

        const doc = await ctx.db.get(args.id);
        if (!doc || doc.userId !== user._id) return null;

        return doc;
    },
});
