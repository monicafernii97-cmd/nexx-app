/**
 * Generated Documents Export — Convex lifecycle mutations for the export pipeline.
 *
 * Four lifecycle mutations model the full export pipeline:
 *   createExportRun  → record created at pipeline start (status: 'drafting')
 *   updateExportRun  → incremental updates during pipeline stages
 *   finalizeExportRun → mark completed with storageId/filename/counts
 *   failExportRun    → mark failed with typed error code + message
 *
 * Plus: getRecentExports, getExportById, updateDocumentStatus, deleteExport.
 *
 * All mutations are case-ownership guarded.
 */

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthenticatedUser } from './lib/auth';

/** Hard ceiling for query pagination to prevent unbounded reads. */
const MAX_QUERY_LIMIT = 100;

/** Current pipeline version for observability. */
const PIPELINE_VERSION = '8d.1';

// ---------------------------------------------------------------------------
// 1. Create Export Run (pipeline start)
// ---------------------------------------------------------------------------

/** Create a new export record when the pipeline begins. */
export const createExportRun = mutation({
    args: {
        caseId: v.id('cases'),
        runId: v.string(),
        templateId: v.string(),
        templateTitle: v.string(),
        caseType: v.string(),
        courtState: v.string(),
        courtCounty: v.string(),
        petitionerName: v.string(),
        respondentName: v.optional(v.string()),
        causeNumber: v.optional(v.string()),
        exportPath: v.string(),
        /** If this is a retry, reference to the original export */
        retryOfExportId: v.optional(v.id('generatedDocuments')),
        /** The export request config (JSON snapshot) */
        exportConfigJson: v.optional(v.string()),
        /** The assembly result snapshot (JSON) */
        assemblySnapshotJson: v.optional(v.string()),
        /** GPT model used for drafting */
        model: v.optional(v.string()),
        /** Version lineage — root export ID */
        rootExportId: v.optional(v.id('generatedDocuments')),
        /** Version lineage — parent export ID */
        parentExportId: v.optional(v.id('generatedDocuments')),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        // Verify case ownership
        const caseRecord = await ctx.db.get(args.caseId);
        if (!caseRecord || caseRecord.userId !== user._id) {
            throw new Error('Case not found or access denied');
        }

        const now = Date.now();

        // Auto-compute version and normalize lineage from validated parent
        let version = 1;
        let parentExportId: typeof args.parentExportId | undefined = undefined;
        let rootExportId: typeof args.rootExportId | undefined = args.rootExportId ?? undefined;

        if (args.parentExportId) {
            const parent = await ctx.db.get(args.parentExportId);
            if (!parent || parent.userId !== user._id || parent.caseId !== args.caseId) {
                throw new Error('Parent export not found or access denied');
            }
            parentExportId = parent._id;
            version = (parent.version ?? 1) + 1;
            // Derive root from parent chain when caller omits it
            if (!rootExportId) {
                rootExportId = parent.rootExportId ?? parent._id;
            }
        }

        return await ctx.db.insert('generatedDocuments', {
            userId: user._id,
            caseId: args.caseId,
            runId: args.runId,
            retryOfExportId: args.retryOfExportId,
            templateId: args.templateId,
            templateTitle: args.templateTitle,
            caseType: args.caseType,
            courtState: args.courtState,
            courtCounty: args.courtCounty,
            petitionerName: args.petitionerName,
            respondentName: args.respondentName,
            causeNumber: args.causeNumber,
            exportPath: args.exportPath,
            exportConfigJson: args.exportConfigJson,
            assemblySnapshotJson: args.assemblySnapshotJson,
            model: args.model ?? 'gpt-5.4',
            pipelineVersion: PIPELINE_VERSION,
            status: 'drafting',
            startedAt: now,
            version,
            rootExportId,
            parentExportId,
            currentStage: 'draft',
            createdAt: now,
            updatedAt: now,
        });
    },
});

// ---------------------------------------------------------------------------
// 2. Update Export Run (incremental stage updates)
// ---------------------------------------------------------------------------

/** Update an in-progress export during pipeline execution. */
export const updateExportRun = mutation({
    args: {
        exportId: v.id('generatedDocuments'),
        status: v.optional(v.union(
            v.literal('drafting'),
            v.literal('preflight'),
            v.literal('rendering'),
            v.literal('saving'),
        )),
        /** Draft output JSON (after GPT drafting completes) */
        draftOutputJson: v.optional(v.string()),
        draftSchemaVersion: v.optional(v.number()),
        /** Preflight result JSON (after preflight completes) */
        preflightJson: v.optional(v.string()),
        preflightSchemaVersion: v.optional(v.number()),
        complianceStatus: v.optional(v.union(
            v.literal('pass'),
            v.literal('warning'),
            v.literal('error'),
        )),
        /** Section counts (after drafting completes) */
        sectionCount: v.optional(v.number()),
        aiDraftedCount: v.optional(v.number()),
        lockedCount: v.optional(v.number()),
        /** Pipeline stage tracking */
        currentStage: v.optional(v.union(
            v.literal('draft'),
            v.literal('preflight'),
            v.literal('render'),
            v.literal('upload'),
            v.literal('finalize')
        )),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const doc = await ctx.db.get(args.exportId);

        if (!doc || doc.userId !== user._id) {
            throw new Error('Export not found or access denied');
        }

        // Only allow updates on in-progress exports
        const inProgressStatuses = ['drafting', 'preflight', 'rendering', 'saving'];
        if (!inProgressStatuses.includes(doc.status)) {
            throw new Error(`Cannot update export in '${doc.status}' status`);
        }

        const { exportId, ...updates } = args;
        const filtered = Object.fromEntries(
            Object.entries(updates).filter(([, val]) => val !== undefined),
        );

        await ctx.db.patch(exportId, {
            ...filtered,
            updatedAt: Date.now(),
        });
    },
});

// ---------------------------------------------------------------------------
// 3. Finalize Export Run (pipeline success)
// ---------------------------------------------------------------------------

/** Mark an export as successfully completed with PDF reference. */
export const finalizeExportRun = mutation({
    args: {
        exportId: v.id('generatedDocuments'),
        storageId: v.id('_storage'),
        filename: v.string(),
        byteSize: v.number(),
        mimeType: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const doc = await ctx.db.get(args.exportId);

        if (!doc || doc.userId !== user._id) {
            throw new Error('Export not found or access denied');
        }

        // Guard: only in-progress exports can be finalized
        const finalizableStatuses = ['drafting', 'preflight', 'rendering', 'saving'];
        if (!finalizableStatuses.includes(doc.status)) {
            throw new Error(`Cannot finalize export in '${doc.status}' status`);
        }

        const now = Date.now();
        await ctx.db.patch(args.exportId, {
            status: 'completed',
            storageId: args.storageId,
            filename: args.filename,
            byteSize: args.byteSize,
            mimeType: args.mimeType ?? 'application/pdf',
            currentStage: 'finalize',
            completedAt: now,
            durationMs: doc.startedAt ? now - doc.startedAt : undefined,
            updatedAt: now,
        });
    },
});

// ---------------------------------------------------------------------------
// 4. Fail Export Run (pipeline error)
// ---------------------------------------------------------------------------

/** Mark an export as failed with typed error code. */
export const failExportRun = mutation({
    args: {
        exportId: v.id('generatedDocuments'),
        errorCode: v.string(),
        errorMessage: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const doc = await ctx.db.get(args.exportId);

        if (!doc || doc.userId !== user._id) {
            throw new Error('Export not found or access denied');
        }

        const now = Date.now();
        await ctx.db.patch(args.exportId, {
            status: 'failed',
            errorCode: args.errorCode,
            errorMessage: args.errorMessage,
            completedAt: now,
            durationMs: doc.startedAt ? now - doc.startedAt : undefined,
            updatedAt: now,
        });
    },
});

// ---------------------------------------------------------------------------
// Get a single export by ID (for download route)
// ---------------------------------------------------------------------------

/** Fetch a single export by ID — ownership-guarded. */
export const getExportById = query({
    args: {
        exportId: v.id('generatedDocuments'),
    },
    handler: async (ctx, { exportId }) => {
        const user = await getAuthenticatedUser(ctx);
        const doc = await ctx.db.get(exportId);

        if (!doc || doc.userId !== user._id) {
            throw new Error('Export not found or access denied');
        }

        // Return full record for download + detail views
        return doc;
    },
});

// ---------------------------------------------------------------------------
// Get recent exports for Export History panel
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

        // Strip heavy JSON blobs — return only metadata for the list UI
        return docs.map((doc) => ({
            _id: doc._id,
            _creationTime: doc._creationTime,
            caseId: doc.caseId,
            templateId: doc.templateId,
            templateTitle: doc.templateTitle,
            caseType: doc.caseType,
            status: doc.status,
            courtState: doc.courtState,
            courtCounty: doc.courtCounty,
            petitionerName: doc.petitionerName,
            respondentName: doc.respondentName,
            storageId: doc.storageId,
            filename: doc.filename,
            exportPath: doc.exportPath,
            sectionCount: doc.sectionCount,
            version: doc.version,
            rootExportId: doc.rootExportId,
            parentExportId: doc.parentExportId,
            currentStage: doc.currentStage,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
        }));
    },
});

// ---------------------------------------------------------------------------
// Update document status (post-completion lifecycle)
// ---------------------------------------------------------------------------

/**
 * Advance a completed document's status lifecycle.
 *
 * Valid transitions: completed → final → filed.
 * Downgrading a filed document is not permitted to protect audit integrity.
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

        // Enforce progression: completed → final → filed
        const validPredecessors: Record<string, string[]> = {
            final: ['completed', 'draft'],
            filed: ['final'],
        };
        if (!validPredecessors[status]?.includes(doc.status)) {
            throw new Error(`Cannot transition from '${doc.status}' to '${status}'`);
        }

        await ctx.db.patch(documentId, {
            status,
            updatedAt: Date.now(),
        });
    },
});

// ---------------------------------------------------------------------------
// Delete a draft/failed document
// ---------------------------------------------------------------------------

/**
 * Delete a draft or failed document.
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

        const deletableStatuses = ['draft', 'drafting', 'failed'];
        if (!deletableStatuses.includes(doc.status)) {
            throw new Error('Only draft or failed documents can be deleted');
        }

        // Best-effort storage cleanup
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

// ---------------------------------------------------------------------------
// Generate upload URL (for API route to upload PDF)
// ---------------------------------------------------------------------------

/** Generate a signed upload URL for the API route to upload PDF to storage. */
export const generateExportUploadUrl = mutation({
    args: {},
    handler: async (ctx) => {
        await getAuthenticatedUser(ctx);
        return await ctx.storage.generateUploadUrl();
    },
});

// ---------------------------------------------------------------------------
// Get storage URL (for download route)
// ---------------------------------------------------------------------------

/** Resolve a storage ID to a signed download URL. */
export const getStorageUrl = query({
    args: {
        storageId: v.id('_storage'),
    },
    handler: async (ctx, { storageId }) => {
        await getAuthenticatedUser(ctx);
        return await ctx.storage.getUrl(storageId);
    },
});

// ---------------------------------------------------------------------------
// Get full export session for Review Hub re-entry
// ---------------------------------------------------------------------------

/**
 * Fetch full export data for Review Hub re-entry ("Rerun from Review").
 *
 * Returns the full doc including assembly snapshot, export config, draft
 * output, and preflight data so the review page can hydrate state.
 */
export const getExportSessionForReview = query({
    args: {
        exportId: v.id('generatedDocuments'),
    },
    handler: async (ctx, { exportId }) => {
        const user = await getAuthenticatedUser(ctx);
        const doc = await ctx.db.get(exportId);

        if (!doc || doc.userId !== user._id) {
            throw new Error('Export not found or access denied');
        }

        return {
            _id: doc._id,
            caseId: doc.caseId,
            templateId: doc.templateId,
            templateTitle: doc.templateTitle,
            caseType: doc.caseType,
            exportPath: doc.exportPath,
            status: doc.status,
            version: doc.version,
            rootExportId: doc.rootExportId,
            parentExportId: doc.parentExportId,
            currentStage: doc.currentStage,
            exportConfigJson: doc.exportConfigJson,
            assemblySnapshotJson: doc.assemblySnapshotJson,
            draftOutputJson: doc.draftOutputJson,
            preflightJson: doc.preflightJson,
            errorCode: doc.errorCode,
            errorMessage: doc.errorMessage,
            createdAt: doc.createdAt,
        };
    },
});

