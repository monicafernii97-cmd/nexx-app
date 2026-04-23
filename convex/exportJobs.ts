/**
 * Export Jobs — Queue Admission Control
 *
 * Convex mutations/queries for concurrency-gated export execution.
 * The SSE route calls `enqueueExportJob` before starting the pipeline.
 * If the user is at their concurrency limit, the request is rejected
 * with EXPORT_QUEUE_OVERLOADED.
 *
 * Lifecycle:
 *   enqueue (queued) → start (running) → complete | fail | timeout
 *
 * The route handler owns execution (inline SSE). This module only
 * controls admission and tracks lifecycle for observability + cleanup.
 */

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUser } from './lib/auth';
import {
    MAX_CONCURRENT_EXPORTS_PER_USER,
    JOB_TIMEOUT_MS,
    STALE_RUN_TTL_MS,
} from './lib/exportConfig';

// Re-export for test sync verification
export { MAX_CONCURRENT_EXPORTS_PER_USER, JOB_TIMEOUT_MS, STALE_RUN_TTL_MS };

// ---------------------------------------------------------------------------
// 1. Enqueue Export Job (admission control)
// ---------------------------------------------------------------------------

/**
 * Check concurrency limits and create a job if under the limit.
 *
 * Returns:
 * - `{ status: 'accepted', jobId }` — job created, proceed with execution
 * - `{ status: 'rejected', reason }` — over limit, do not proceed
 */
export const enqueueExportJob = mutation({
    args: {
        caseId: v.optional(v.id('cases')),
        exportPath: v.string(),
        fingerprint: v.string(),
        priority: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const now = Date.now();

        // Count active jobs (queued + running) for this user,
        // excluding expired jobs (timeoutAt < now) that the cron
        // hasn't reaped yet.
        const activeJobs = await ctx.db
            .query('exportJobs')
            .withIndex('by_userId_status', (q) => q.eq('userId', user._id).eq('status', 'queued'))
            .collect();

        const runningJobs = await ctx.db
            .query('exportJobs')
            .withIndex('by_userId_status', (q) => q.eq('userId', user._id).eq('status', 'running'))
            .collect();

        // Opportunistically reap expired jobs to free capacity immediately
        // instead of waiting for the next cron cycle.
        const allJobs = [...activeJobs, ...runningJobs];
        let reaped = 0;
        for (const job of allJobs) {
            if (job.timeoutAt < now) {
                await ctx.db.patch(job._id, {
                    status: 'timeout',
                    completedAt: now,
                    errorCode: 'EXPORT_JOB_TIMEOUT',
                });
                reaped++;
            }
        }

        const activeCount = allJobs.length - reaped;

        if (activeCount >= MAX_CONCURRENT_EXPORTS_PER_USER) {
            return {
                status: 'rejected' as const,
                reason: 'EXPORT_QUEUE_OVERLOADED',
                activeCount,
                limit: MAX_CONCURRENT_EXPORTS_PER_USER,
            };
        }

        // Admit the job
        const jobId = await ctx.db.insert('exportJobs', {
            userId: user._id,
            caseId: args.caseId,
            exportPath: args.exportPath,
            fingerprint: args.fingerprint,
            status: 'queued',
            priority: args.priority ?? 0,
            createdAt: now,
            timeoutAt: now + STALE_RUN_TTL_MS,
        });

        return {
            status: 'accepted' as const,
            jobId,
        };
    },
});

// ---------------------------------------------------------------------------
// 2. Start Export Job (queued → running)
// ---------------------------------------------------------------------------

/** Transition a job from queued to running. Sets startedAt timestamp. */
export const startExportJob = mutation({
    args: {
        jobId: v.id('exportJobs'),
    },
    handler: async (ctx, { jobId }) => {
        const user = await getAuthenticatedUser(ctx);
        const job = await ctx.db.get(jobId);

        if (!job) {
            throw new Error('Export job not found');
        }
        if (job.userId !== user._id) {
            throw new Error('Export job ownership mismatch');
        }
        if (job.status !== 'queued') {
            throw new Error(`Cannot start job in '${job.status}' status`);
        }

        await ctx.db.patch(jobId, {
            status: 'running',
            startedAt: Date.now(),
        });
    },
});

// ---------------------------------------------------------------------------
// 3. Complete Export Job (running → completed)
// ---------------------------------------------------------------------------

/** Mark a running job as completed. */
export const completeExportJob = mutation({
    args: {
        jobId: v.id('exportJobs'),
    },
    handler: async (ctx, { jobId }) => {
        const user = await getAuthenticatedUser(ctx);
        const job = await ctx.db.get(jobId);

        if (!job) {
            throw new Error('Export job not found');
        }
        if (job.userId !== user._id) {
            throw new Error('Export job ownership mismatch');
        }
        // Allow completing from running or queued (fast path)
        if (job.status !== 'running' && job.status !== 'queued') {
            return; // Already terminal — no-op
        }

        await ctx.db.patch(jobId, {
            status: 'completed',
            completedAt: Date.now(),
        });
    },
});

// ---------------------------------------------------------------------------
// 4. Fail Export Job (non-terminal → failed)
// ---------------------------------------------------------------------------

/** Mark a non-terminal export job as failed with an optional error code. */
export const failExportJob = mutation({
    args: {
        jobId: v.id('exportJobs'),
        errorCode: v.optional(v.string()),
    },
    handler: async (ctx, { jobId, errorCode }) => {
        const user = await getAuthenticatedUser(ctx);
        const job = await ctx.db.get(jobId);

        if (!job) {
            throw new Error('Export job not found');
        }
        if (job.userId !== user._id) {
            throw new Error('Export job ownership mismatch');
        }
        // Don't revert a completed job
        if (job.status === 'completed' || job.status === 'failed' || job.status === 'timeout') {
            return; // Already terminal — no-op
        }

        await ctx.db.patch(jobId, {
            status: 'failed',
            completedAt: Date.now(),
            errorCode,
        });
    },
});

// ---------------------------------------------------------------------------
// 5. Get Active Job Count (for diagnostics)
// ---------------------------------------------------------------------------

/** Count active (queued + running) jobs for the authenticated user. */
export const getActiveJobCount = query({
    handler: async (ctx) => {
        const user = await getAuthenticatedUser(ctx);
        const now = Date.now();

        const queued = await ctx.db
            .query('exportJobs')
            .withIndex('by_userId_status', (q) => q.eq('userId', user._id).eq('status', 'queued'))
            .filter((q) => q.gt(q.field('timeoutAt'), now))
            .collect();

        const running = await ctx.db
            .query('exportJobs')
            .withIndex('by_userId_status', (q) => q.eq('userId', user._id).eq('status', 'running'))
            .filter((q) => q.gt(q.field('timeoutAt'), now))
            .collect();

        return {
            queued: queued.length,
            running: running.length,
            total: queued.length + running.length,
            limit: MAX_CONCURRENT_EXPORTS_PER_USER,
        };
    },
});

// ---------------------------------------------------------------------------
// 6. Get Job by Fingerprint (for SSE reconnection)
// ---------------------------------------------------------------------------

/** Look up a job by fingerprint, scoped to the authenticated user. */
export const getJobByFingerprint = query({
    args: {
        fingerprint: v.string(),
    },
    handler: async (ctx, { fingerprint }) => {
        const user = await getAuthenticatedUser(ctx);

        // Use composite index to guarantee the result belongs to the caller.
        // Avoids false negatives when another user has the same fingerprint.
        const job = await ctx.db
            .query('exportJobs')
            .withIndex('by_fingerprint_userId', (q) =>
                q.eq('fingerprint', fingerprint).eq('userId', user._id),
            )
            .first();

        return job ?? null;
    },
});
