/**
 * Quick Generate Artifacts — Convex mutations for the Quick Generate PDF pipeline.
 *
 * Reuses the `generatedDocuments` table with `exportPath: 'quick_generate'`.
 * Provides create + download info queries specific to the Quick Generate flow.
 */

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthenticatedUser } from './lib/auth';

// ---------------------------------------------------------------------------
// 1. Create Quick Generate Artifact (after PDF is stored)
// ---------------------------------------------------------------------------

/** Create a completed Quick Generate document record. */
export const createQuickGenArtifact = mutation({
    args: {
        storageId: v.id('_storage'),
        filename: v.string(),
        byteSize: v.number(),
        sha256: v.string(),
        requestId: v.string(),
        templateId: v.string(),
        templateTitle: v.string(),
        caseType: v.string(),
        courtState: v.string(),
        courtCounty: v.string(),
        petitionerName: v.string(),
        respondentName: v.optional(v.string()),
        causeNumber: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const now = Date.now();
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
            storageId: args.storageId,
            filename: args.filename,
            mimeType: 'application/pdf',
            byteSize: args.byteSize,
            sha256: args.sha256,
            exportPath: 'quick_generate',
            status: 'completed',
            runId: args.requestId,
            pipelineVersion: 'quickgen-2.0',
            startedAt: now,
            completedAt: now,
            createdAt: now,
            updatedAt: now,
        });

        return {
            artifactId: docId,
            filename: args.filename,
            byteLength: args.byteSize,
            sha256: args.sha256,
        };
    },
});

// ---------------------------------------------------------------------------
// 2. Get Download Info (for the download route)
// ---------------------------------------------------------------------------

/** Fetch artifact metadata + storage URL for the download route. */
export const getQuickGenDownloadInfo = query({
    args: {
        artifactId: v.id('generatedDocuments'),
    },
    handler: async (ctx, { artifactId }) => {
        const artifact = await ctx.db.get(artifactId);
        if (!artifact) return null;

        // Auth check: must be the owner
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
        if (!user || artifact.userId !== user._id) return null;

        if (artifact.status !== 'completed' && artifact.status !== 'final' && artifact.status !== 'filed') {
            return null;
        }

        if (!artifact.storageId) return null;

        const storageUrl = await ctx.storage.getUrl(artifact.storageId);
        if (!storageUrl) return null;

        return {
            artifactId: artifact._id,
            filename: artifact.filename ?? 'document.pdf',
            mimeType: artifact.mimeType ?? 'application/pdf',
            byteLength: artifact.byteSize ?? 0,
            sha256: artifact.sha256,
            storageUrl,
            status: artifact.status,
        };
    },
});
