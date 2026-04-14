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
        caseId: v.optional(v.id('cases')),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        // Verify incidentId belongs to this user
        if (args.incidentId) {
            const incident = await ctx.db.get(args.incidentId);
            if (!incident || incident.userId !== user._id) {
                throw new Error('Not authorized to link to this incident');
            }
        }

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
            caseId: args.caseId,
        });
    },
});

/** List documents for the authenticated user, optionally filtered by type */
export const list = query({
    args: {
        type: v.optional(documentTypeValidator),
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
            const results = await ctx.db
                .query('documents')
                .withIndex('by_user_case', (q) =>
                    q.eq('userId', user._id).eq('caseId', args.caseId!)
                )
                .order('desc')
                .collect();
            // Filter by type client-side when using case index
            if (args.type) {
                return results.filter((d) => d.type === args.type);
            }
            return results;
        }

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

        // Verify incidentId belongs to this user
        if (args.incidentId) {
            const incident = await ctx.db.get(args.incidentId);
            if (!incident || incident.userId !== user._id) {
                throw new Error('Not authorized to link to this incident');
            }
        }

        // Best-effort cleanup of old blob when storageId changes
        if (args.storageId && doc.storageId && args.storageId !== doc.storageId) {
            try {
                await ctx.storage.delete(doc.storageId);
            } catch (err) {
                console.warn('Failed to clean up old storage blob:', err);
            }
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

        // Best-effort storage blob cleanup — don't block document deletion
        if (doc.storageId) {
            try {
                await ctx.storage.delete(doc.storageId);
            } catch (err) {
                console.warn('Failed to delete storage blob:', err);
            }
        }

        await ctx.db.delete(args.id);
    },
});
