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

/** Hard ceiling for query pagination to prevent unbounded reads. */
const MAX_QUERY_LIMIT = 100;

// ---------------------------------------------------------------------------
// Save a generated document from the export pipeline
// ---------------------------------------------------------------------------

/** Save the pipeline output to generatedDocuments with case-ownership check. */
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

        // Verify the caller owns this case (prevents cross-tenant references)
        const caseRecord = await ctx.db.get(args.caseId);
        if (!caseRecord || caseRecord.userId !== user._id) {
            throw new Error('Case not found or access denied');
        }

        const docId = await ctx.db.insert('generatedDocuments', {
            userId: user._id,
            caseId: args.caseId,
            templateId: args.templateId,
            templateTitle: args.templateTitle,
            caseType: args.caseType,
            courtState: args.courtState,
            courtCounty: args.courtCounty,
            petitionerName: args.petitionerName,
            respondentName: args.respondentName,
            causeNumber: args.causeNumber,
            draftOutputJson: args.draftOutputJson,
            assemblySnapshotJson: args.assemblySnapshotJson,
            exportConfigJson: args.exportConfigJson,
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

/** Fetch recent exported documents for the current user (clamped to 100). */
export const getRecentExports = query({
    args: {
        limit: v.optional(v.number()),
    },
    handler: async (ctx, { limit }) => {
        const user = await getAuthenticatedUser(ctx);
        const requested = limit ?? 20;
        const maxResults = Math.min(MAX_QUERY_LIMIT, Math.max(1, Math.trunc(requested)));

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

/**
 * Advance a document's status lifecycle.
 *
 * Valid transitions: draft → final → filed. Downgrading a filed document
 * is not permitted to protect audit integrity.
 */
export const updateDocumentStatus = mutation({
    args: {
        documentId: v.id('generatedDocuments'),
        status: v.union(
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

        // Prevent downgrading a filed document
        if (doc.status === 'filed' && status !== 'filed') {
            throw new Error('Filed documents cannot be downgraded');
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

/**
 * Delete a draft document (only drafts can be deleted).
 *
 * Storage cleanup is best-effort — an orphan blob is preferable to
 * leaving documents undeletable.
 */
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

        // Best-effort storage cleanup — orphan blob is preferable to blocking deletion
        if (doc.storageId) {
            try {
                await ctx.storage.delete(doc.storageId);
            } catch (err) {
                console.warn('[deleteExport] Failed to delete blob:', doc.storageId, err);
            }
        }

        await ctx.db.delete(documentId);
    },
});
