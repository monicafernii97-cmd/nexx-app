/** Read-only operational previews. These functions never delete or patch data. */
import { v } from 'convex/values';
import { internalQuery } from './_generated/server';
import { COMPLETED_RUN_RETENTION_MS, STALE_RUN_TTL_MS } from './lib/exportConfig';

const PREVIEW_LIMIT = 100;

export const previewMaintenance = internalQuery({
    args: { now: v.optional(v.number()) },
    handler: async (ctx, { now: suppliedNow }) => {
        const now = suppliedNow ?? Date.now();
        const staleRunCutoff = now - STALE_RUN_TTL_MS;
        const [staleRuns, timedOutRunningJobs, timedOutQueuedJobs, expiredChatJobs] = await Promise.all([
            ctx.db
                .query('exportRuns')
                .withIndex('by_status_createdAt', (q) =>
                    q.eq('status', 'in_progress').lt('createdAt', staleRunCutoff)
                )
                .take(PREVIEW_LIMIT),
            ctx.db
                .query('exportJobs')
                .withIndex('by_status_timeoutAt', (q) => q.eq('status', 'running').lt('timeoutAt', now))
                .take(PREVIEW_LIMIT),
            ctx.db
                .query('exportJobs')
                .withIndex('by_status_timeoutAt', (q) => q.eq('status', 'queued').lt('timeoutAt', now))
                .take(PREVIEW_LIMIT),
            ctx.db
                .query('chatGenerationJobs')
                .withIndex('by_status_leaseExpiresAt', (q) => q.eq('status', 'running').lt('leaseExpiresAt', now))
                .take(PREVIEW_LIMIT),
        ]);

        return {
            readOnly: true,
            generatedAt: now,
            cappedAt: PREVIEW_LIMIT,
            staleExportRuns: staleRuns.length,
            timedOutExportJobs: timedOutRunningJobs.length + timedOutQueuedJobs.length,
            expiredChatGenerationLeases: expiredChatJobs.length,
        };
    },
});
export const previewExportRetention = internalQuery({
    args: {
        now: v.optional(v.number()),
        retentionDays: v.optional(v.number()),
    },
    handler: async (ctx, input) => {
        const now = input.now ?? Date.now();
        const requestedMs = input.retentionDays === undefined
            ? COMPLETED_RUN_RETENTION_MS
            : Math.max(7, Math.min(365, input.retentionDays)) * 24 * 60 * 60 * 1000;
        const cutoff = now - requestedMs;
        const [completedRuns, failedRuns, completedJobs, failedJobs, timedOutJobs] = await Promise.all([
            ctx.db.query('exportRuns').withIndex('by_status_createdAt', (q) => q.eq('status', 'completed').lt('createdAt', cutoff)).take(PREVIEW_LIMIT),
            ctx.db.query('exportRuns').withIndex('by_status_createdAt', (q) => q.eq('status', 'failed').lt('createdAt', cutoff)).take(PREVIEW_LIMIT),
            ctx.db.query('exportJobs').withIndex('by_status_createdAt', (q) => q.eq('status', 'completed').lt('createdAt', cutoff)).take(PREVIEW_LIMIT),
            ctx.db.query('exportJobs').withIndex('by_status_createdAt', (q) => q.eq('status', 'failed').lt('createdAt', cutoff)).take(PREVIEW_LIMIT),
            ctx.db.query('exportJobs').withIndex('by_status_createdAt', (q) => q.eq('status', 'timeout').lt('createdAt', cutoff)).take(PREVIEW_LIMIT),
        ]);

        return {
            readOnly: true,
            generatedAt: now,
            retentionDays: requestedMs / (24 * 60 * 60 * 1000),
            cutoff,
            cappedAtPerStatus: PREVIEW_LIMIT,
            exportRuns: { completed: completedRuns.length, failed: failedRuns.length },
            exportJobs: { completed: completedJobs.length, failed: failedJobs.length, timeout: timedOutJobs.length },
            note: 'Counts equal to the cap mean more candidates may exist. No records were changed.',
        };
    },
});
