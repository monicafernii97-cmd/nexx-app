/**
 * Generated Documents Export — Convex mutations for saving pipeline output
 * and retrieving download URLs.
 *
 * Saves the draft output, assembly snapshot, and export config to the
 * generatedDocuments table for version history and recovery. Case-scoped.
 */

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthenticatedUser } from './lib/auth';

// ---------------------------------------------------------------------------
// Save a generated document from the export pipeline
// ---------------------------------------------------------------------------

/** Save the pipeline output to generatedDocuments. */
export const saveExportResult = mutation({
    args: {
        caseId: v.id('cases'),
        templateId: v.string(),
        templateTitle: v.string(),
        caseType: v.string(),
        courtState: v.string(),
        courtCounty: v.string(),
        petitionerName: v.string(),
        respondentName: v.optional(v.string()),
        causeNumber: v.optional(v.string()),
        /** The draft output JSON from the pipeline */
        draftOutputJson: v.string(),
        /** The assembly result JSON snapshot */
        assemblySnapshotJson: v.optional(v.string()),
        /** The export request JSON snapshot */
        exportConfigJson: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const docId = await ctx.db.insert('generatedDocuments', {
            userId: user._id,
            templateId: args.templateId,
            templateTitle: args.templateTitle,
            caseType: args.caseType,
            courtState: args.courtState,
            courtCounty: args.courtCounty,
            petitionerName: args.petitionerName,
            respondentName: args.respondentName,
            causeNumber: args.causeNumber,
            status: 'draft',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        return docId;
    },
});

// ---------------------------------------------------------------------------
// Get recent exports for a user (for Export History panel)
// ---------------------------------------------------------------------------

/** Fetch recent exported documents for the current user. */
export const getRecentExports = query({
    args: {
        limit: v.optional(v.number()),
    },
    handler: async (ctx, { limit }) => {
        const user = await getAuthenticatedUser(ctx);
        const maxResults = limit ?? 20;

        const docs = await ctx.db
            .query('generatedDocuments')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .order('desc')
            .take(maxResults);

        return docs;
    },
});

// ---------------------------------------------------------------------------
// Update document status
// ---------------------------------------------------------------------------

/** Mark a document as final or filed. */
export const updateDocumentStatus = mutation({
    args: {
        documentId: v.id('generatedDocuments'),
        status: v.union(
            v.literal('draft'),
            v.literal('final'),
            v.literal('filed'),
        ),
    },
    handler: async (ctx, { documentId, status }) => {
        const user = await getAuthenticatedUser(ctx);
        const doc = await ctx.db.get(documentId);

        if (!doc || doc.userId !== user._id) {
            throw new Error('Document not found or access denied');
        }

        await ctx.db.patch(documentId, {
            status,
            updatedAt: Date.now(),
        });
    },
});

// ---------------------------------------------------------------------------
// Delete a draft document
// ---------------------------------------------------------------------------

/** Delete a draft document (only drafts can be deleted). */
export const deleteExport = mutation({
    args: {
        documentId: v.id('generatedDocuments'),
    },
    handler: async (ctx, { documentId }) => {
        const user = await getAuthenticatedUser(ctx);
        const doc = await ctx.db.get(documentId);

        if (!doc || doc.userId !== user._id) {
            throw new Error('Document not found or access denied');
        }

        if (doc.status !== 'draft') {
            throw new Error('Only draft documents can be deleted');
        }

        // Delete associated storage if present
        if (doc.storageId) {
            await ctx.storage.delete(doc.storageId);
        }

        await ctx.db.delete(documentId);
    },
});
