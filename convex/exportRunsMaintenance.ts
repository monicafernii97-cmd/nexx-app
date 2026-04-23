/**
 * Export Runs Maintenance — Scheduled Cleanup
 *
 * Internal mutations invoked by Convex cron jobs to:
 * 1. Reap stale in_progress export runs (stuck beyond TTL)
 * 2. Reap timed-out export jobs (past timeoutAt)
 * 3. Purge expired completed/failed records (beyond retention window)
 *
 * These are internal actions — not callable by clients.
 */

import { internalMutation } from './_generated/server';

// ── Config (mirrored from src/lib/exports/exportConfig.ts) ──
// Convex server code can't import from src/, so we duplicate.
const STALE_RUN_TTL_MS = 10 * 60 * 1000;              // 10 minutes
const COMPLETED_RUN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Max records to process per cron invocation to avoid timeout. */
const BATCH_LIMIT = 100;

// ---------------------------------------------------------------------------
// 1. Reap stale in_progress export runs
// ---------------------------------------------------------------------------

/**
 * Find exportRuns stuck in 'in_progress' beyond the stale TTL
 * and mark them as 'failed' with EXPORT_JOB_TIMEOUT.
 *
 * Also reaps exportJobs that are past their timeoutAt.
 */
export const reapStaleRuns = internalMutation({
    handler: async (ctx) => {
        const now = Date.now();
        const staleCutoff = now - STALE_RUN_TTL_MS;

        // ── Reap stale exportRuns ──
        const staleRuns = await ctx.db
            .query('exportRuns')
            .withIndex('by_status', (q) => q.eq('status', 'in_progress'))
            .take(BATCH_LIMIT);

        let reapedRuns = 0;
        for (const run of staleRuns) {
            if (run.createdAt < staleCutoff) {
                await ctx.db.patch(run._id, {
                    status: 'failed',
                    errorCode: 'EXPORT_JOB_TIMEOUT',
                    updatedAt: now,
                });
                reapedRuns++;
            }
        }

        // ── Reap timed-out exportJobs ──
        const runningJobs = await ctx.db
            .query('exportJobs')
            .withIndex('by_status_createdAt', (q) => q.eq('status', 'running'))
            .take(BATCH_LIMIT);

        const queuedJobs = await ctx.db
            .query('exportJobs')
            .withIndex('by_status_createdAt', (q) => q.eq('status', 'queued'))
            .take(BATCH_LIMIT);

        let reapedJobs = 0;
        for (const job of [...runningJobs, ...queuedJobs]) {
            if (job.timeoutAt < now) {
                await ctx.db.patch(job._id, {
                    status: 'timeout',
                    completedAt: now,
                    errorCode: 'EXPORT_JOB_TIMEOUT',
                });
                reapedJobs++;
            }
        }

        if (reapedRuns > 0 || reapedJobs > 0) {
            console.log(
                `[ExportMaintenance] Reaped ${reapedRuns} stale runs, ${reapedJobs} timed-out jobs`,
            );
        }
    },
});

// ---------------------------------------------------------------------------
// 2. Purge expired export runs (completed/failed beyond retention)
// ---------------------------------------------------------------------------

/**
 * Delete exportRuns and exportJobs records that are:
 * - In a terminal state (completed, failed, timeout)
 * - Older than the retention window (30 days)
 */
export const purgeExpiredRuns = internalMutation({
    handler: async (ctx) => {
        const cutoff = Date.now() - COMPLETED_RUN_RETENTION_MS;

        // ── Purge expired exportRuns ──
        const expiredRuns = await ctx.db
            .query('exportRuns')
            .withIndex('by_createdAt')
            .filter((q) => q.lt(q.field('createdAt'), cutoff))
            .take(BATCH_LIMIT);

        let purgedRuns = 0;
        for (const run of expiredRuns) {
            // Only delete terminal records
            if (run.status === 'completed' || run.status === 'failed') {
                await ctx.db.delete(run._id);
                purgedRuns++;
            }
        }

        // ── Purge expired exportJobs ──
        const expiredJobs = await ctx.db
            .query('exportJobs')
            .withIndex('by_status_createdAt')
            .filter((q) => q.lt(q.field('createdAt'), cutoff))
            .take(BATCH_LIMIT);

        let purgedJobs = 0;
        for (const job of expiredJobs) {
            if (job.status === 'completed' || job.status === 'failed' || job.status === 'timeout') {
                await ctx.db.delete(job._id);
                purgedJobs++;
            }
        }

        if (purgedRuns > 0 || purgedJobs > 0) {
            console.log(
                `[ExportMaintenance] Purged ${purgedRuns} expired runs, ${purgedJobs} expired jobs`,
            );
        }
    },
});
