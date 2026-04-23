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
import { STALE_RUN_TTL_MS, COMPLETED_RUN_RETENTION_MS } from './lib/exportConfig';

// Re-export for test sync verification
export { STALE_RUN_TTL_MS, COMPLETED_RUN_RETENTION_MS };

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
        // Query by createdAt (oldest first) to ensure we always reach the
        // oldest stuck records, even if many recent in_progress rows exist.
        const candidateRuns = await ctx.db
            .query('exportRuns')
            .withIndex('by_createdAt')
            .filter((q) => q.lt(q.field('createdAt'), staleCutoff))
            .take(BATCH_LIMIT);

        let reapedRuns = 0;
        for (const run of candidateRuns) {
            // Only reap runs that are still in_progress
            if (run.status === 'in_progress') {
                await ctx.db.patch(run._id, {
                    status: 'failed',
                    errorCode: 'EXPORT_JOB_TIMEOUT',
                    updatedAt: now,
                });
                reapedRuns++;
            }
        }

        // ── Reap timed-out exportJobs ──
        // Use by_status_timeoutAt so we scan overdue jobs directly.
        const runningJobs = await ctx.db
            .query('exportJobs')
            .withIndex('by_status_timeoutAt', (q) => q.eq('status', 'running'))
            .filter((q) => q.lt(q.field('timeoutAt'), now))
            .take(BATCH_LIMIT);

        const queuedJobs = await ctx.db
            .query('exportJobs')
            .withIndex('by_status_timeoutAt', (q) => q.eq('status', 'queued'))
            .filter((q) => q.lt(q.field('timeoutAt'), now))
            .take(BATCH_LIMIT);

        let reapedJobs = 0;
        for (const job of [...runningJobs, ...queuedJobs]) {
            await ctx.db.patch(job._id, {
                status: 'timeout',
                completedAt: now,
                errorCode: 'EXPORT_JOB_TIMEOUT',
            });
            reapedJobs++;
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
            .withIndex('by_createdAt')
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
