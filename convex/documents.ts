import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUser } from './lib/auth';

/** Document type enum — shared across args */
const documentTypeValidator = v.union(
    v.literal('court_order'),
    v.literal('police_report'),
    v.literal('medical_record'),
    v.literal('communication_log'),
    v.literal('photo_evidence'),
    v.literal('legal_filing'),
    v.literal('other')
);

/** ── Helper: document type enum ── */

/** Generate an upload URL for Convex file storage — auth-guarded */
export const generateUploadUrl = mutation({
    args: {},
    handler: async (ctx) => {
        await getAuthenticatedUser(ctx);
        return await ctx.storage.generateUploadUrl();
    },
});

/** Create a new document — auth-guarded */
export const create = mutation({
    args: {
        title: v.string(),
        type: documentTypeValidator,
        content: v.optional(v.string()),
        storageId: v.optional(v.id('_storage')),
        fileUrl: v.optional(v.string()),
        mimeType: v.optional(v.string()),
        fileSize: v.optional(v.number()),
        incidentId: v.optional(v.id('incidents')),
        status: v.optional(v.union(v.literal('draft'), v.literal('final'))),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        return await ctx.db.insert('documents', {
            userId: user._id,
            title: args.title,
            type: args.type,
            content: args.content,
            storageId: args.storageId,
            fileUrl: args.fileUrl,
            mimeType: args.mimeType,
            fileSize: args.fileSize,
            incidentId: args.incidentId,
            status: args.status ?? 'draft',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    },
});

/** List documents for the authenticated user, optionally filtered by type */
export const list = query({
    args: {
        type: v.optional(documentTypeValidator),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
        if (!user) return [];

        if (args.type) {
            return await ctx.db
                .query('documents')
                .withIndex('by_user_type', (q) =>
                    q.eq('userId', user._id).eq('type', args.type!)
                )
                .order('desc')
                .collect();
        }

        return await ctx.db
            .query('documents')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .order('desc')
            .collect();
    },
});

/** Get a single document — auth-guarded */
export const get = query({
    args: { id: v.id('documents') },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('Not authenticated');

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
        if (!user) throw new Error('User not found');

        const doc = await ctx.db.get(args.id);
        if (!doc || doc.userId !== user._id) {
            throw new Error('Not authorized');
        }
        return doc;
    },
});

/** Update a document — auth-guarded */
export const update = mutation({
    args: {
        id: v.id('documents'),
        title: v.optional(v.string()),
        type: v.optional(documentTypeValidator),
        content: v.optional(v.string()),
        storageId: v.optional(v.id('_storage')),
        fileUrl: v.optional(v.string()),
        mimeType: v.optional(v.string()),
        fileSize: v.optional(v.number()),
        incidentId: v.optional(v.id('incidents')),
        status: v.optional(v.union(v.literal('draft'), v.literal('final'))),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const doc = await ctx.db.get(args.id);
        if (!doc || doc.userId !== user._id) {
            throw new Error('Not authorized to update this document');
        }

        const { id, ...updates } = args;
        const filtered = Object.fromEntries(
            Object.entries(updates).filter(([, val]) => val !== undefined)
        );
        await ctx.db.patch(id, { ...filtered, updatedAt: Date.now() });
    },
});

/** Remove a document — auth-guarded */
export const remove = mutation({
    args: { id: v.id('documents') },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const doc = await ctx.db.get(args.id);
        if (!doc || doc.userId !== user._id) {
            throw new Error('Not authorized to delete this document');
        }

        // Delete the stored file if present
        if (doc.storageId) {
            await ctx.storage.delete(doc.storageId);
        }

        await ctx.db.delete(args.id);
    },
});
