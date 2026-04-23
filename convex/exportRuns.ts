/**
 * Export Runs — Convex mutations for the idempotency system.
 *
 * Atomic claim/complete/fail lifecycle for export run fingerprints.
 * Prevents duplicate generation from double clicks, retries,
 * network replay, SSE reconnection, and concurrent requests.
 *
 * Lifecycle:
 *   claimExportRun   → claim fingerprint (or return existing result)
 *   completeExportRun → mark completed with exportId
 *   failExportRun     → mark failed (allows retry)
 *   getExportRun      → query by fingerprint
 */

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthenticatedUser } from './lib/auth';

// ---------------------------------------------------------------------------
// 1. Claim Export Run (atomic claim-or-conflict)
// ---------------------------------------------------------------------------

/**
 * Attempt to claim a fingerprint for a new export run.
 *
 * Returns:
 *   - { status: 'claimed' }           → fingerprint is new, run may proceed
 *   - { status: 'already_completed' } → identical run already completed
 *   - { status: 'in_progress' }       → identical run is currently executing
 *
 * Callers should:
 *   - On 'claimed' → proceed with pipeline execution
 *   - On 'already_completed' → return the existing exportId to the client
 *   - On 'in_progress' → throw EXPORT_IDEMPOTENCY_CONFLICT
 */
export const claimExportRun = mutation({
    args: {
        fingerprint: v.string(),
        caseId: v.optional(v.id('cases')),
        exportPath: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        // Check for existing run with this fingerprint
        const existing = await ctx.db
            .query('exportRuns')
            .withIndex('by_fingerprint', (q) => q.eq('fingerprint', args.fingerprint))
            .first();

        if (existing) {
            if (existing.status === 'completed' && existing.exportId) {
                return {
                    status: 'already_completed' as const,
                    exportId: existing.exportId,
                    runId: existing._id,
                };
            }

            if (existing.status === 'in_progress') {
                return {
                    status: 'in_progress' as const,
                    runId: existing._id,
                };
            }

            // Status is 'failed' — allow retry by replacing the record
            await ctx.db.delete(existing._id);
        }

        // Claim the fingerprint
        const now = Date.now();
        const runId = await ctx.db.insert('exportRuns', {
            fingerprint: args.fingerprint,
            userId: user._id,
            caseId: args.caseId,
            exportPath: args.exportPath,
            status: 'in_progress',
            createdAt: now,
            updatedAt: now,
        });

        return {
            status: 'claimed' as const,
            runId,
        };
    },
});

// ---------------------------------------------------------------------------
// 2. Complete Export Run (pipeline success)
// ---------------------------------------------------------------------------

/** Mark an export run as completed and link the exported document. */
export const completeExportRun = mutation({
    args: {
        fingerprint: v.string(),
        exportId: v.id('generatedDocuments'),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const run = await ctx.db
            .query('exportRuns')
            .withIndex('by_fingerprint', (q) => q.eq('fingerprint', args.fingerprint))
            .first();

        if (!run) {
            throw new Error(`Export run not found for fingerprint: ${args.fingerprint}`);
        }

        if (run.userId !== user._id) {
            throw new Error('Export run ownership mismatch');
        }

        if (run.status !== 'in_progress') {
            throw new Error(`Cannot complete export run in '${run.status}' status`);
        }

        await ctx.db.patch(run._id, {
            status: 'completed',
            exportId: args.exportId,
            updatedAt: Date.now(),
        });
    },
});

// ---------------------------------------------------------------------------
// 3. Fail Export Run (pipeline error)
// ---------------------------------------------------------------------------

/** Mark an export run as failed with an error code. */
export const failExportRun = mutation({
    args: {
        fingerprint: v.string(),
        errorCode: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const run = await ctx.db
            .query('exportRuns')
            .withIndex('by_fingerprint', (q) => q.eq('fingerprint', args.fingerprint))
            .first();

        if (!run) {
            // Run may have been cleaned up — not an error
            return;
        }

        if (run.userId !== user._id) {
            throw new Error('Export run ownership mismatch');
        }

        await ctx.db.patch(run._id, {
            status: 'failed',
            errorCode: args.errorCode,
            updatedAt: Date.now(),
        });
    },
});

// ---------------------------------------------------------------------------
// 4. Query Export Run (for diagnostics / observability)
// ---------------------------------------------------------------------------

/** Look up an export run by fingerprint. */
export const getExportRunByFingerprint = query({
    args: {
        fingerprint: v.string(),
    },
    handler: async (ctx, { fingerprint }) => {
        await getAuthenticatedUser(ctx);

        return await ctx.db
            .query('exportRuns')
            .withIndex('by_fingerprint', (q) => q.eq('fingerprint', fingerprint))
            .first();
    },
});
