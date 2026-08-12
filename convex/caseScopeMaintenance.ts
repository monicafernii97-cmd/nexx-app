/**
 * Explicit, bounded migration helpers for legacy workspace rows without caseId.
 * These are internal-only and default to dry-run. Nothing schedules them.
 */
import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

const args = {
    apply: v.optional(v.boolean()),
    batchSize: v.optional(v.number()),
};

function boundedBatchSize(value?: number) {
    return Math.max(1, Math.min(100, Math.floor(value ?? 50)));
}

export const backfillCasePins = internalMutation({
    args,
    handler: async (ctx, input) => {
        const rows = await ctx.db
            .query('casePins')
            .withIndex('by_caseId', (q) => q.eq('caseId', undefined))
            .take(boundedBatchSize(input.batchSize));
        let eligible = 0;
        let updated = 0;
        for (const row of rows) {
            const defaultCase = await ctx.db
                .query('cases')
                .withIndex('by_userId_createdAt', (q) => q.eq('userId', row.userId))
                .order('asc')
                .first();
            if (!defaultCase) continue;
            eligible++;
            if (input.apply === true) {
                await ctx.db.patch(row._id, { caseId: defaultCase._id });
                updated++;
            }
        }
        return { dryRun: input.apply !== true, scanned: rows.length, eligible, updated };
    },
});
export const backfillCaseMemory = internalMutation({
    args,
    handler: async (ctx, input) => {
        const rows = await ctx.db
            .query('caseMemory')
            .withIndex('by_caseId', (q) => q.eq('caseId', undefined))
            .take(boundedBatchSize(input.batchSize));
        let eligible = 0;
        let updated = 0;
        for (const row of rows) {
            const defaultCase = await ctx.db
                .query('cases')
                .withIndex('by_userId_createdAt', (q) => q.eq('userId', row.userId))
                .order('asc')
                .first();
            if (!defaultCase) continue;
            eligible++;
            if (input.apply === true) {
                await ctx.db.patch(row._id, { caseId: defaultCase._id });
                updated++;
            }
        }
        return { dryRun: input.apply !== true, scanned: rows.length, eligible, updated };
    },
});

export const backfillTimelineCandidates = internalMutation({
    args,
    handler: async (ctx, input) => {
        const rows = await ctx.db
            .query('timelineCandidates')
            .withIndex('by_caseId', (q) => q.eq('caseId', undefined))
            .take(boundedBatchSize(input.batchSize));
        let eligible = 0;
        let updated = 0;
        for (const row of rows) {
            const defaultCase = await ctx.db
                .query('cases')
                .withIndex('by_userId_createdAt', (q) => q.eq('userId', row.userId))
                .order('asc')
                .first();
            if (!defaultCase) continue;
            eligible++;
            if (input.apply === true) {
                await ctx.db.patch(row._id, { caseId: defaultCase._id });
                updated++;
            }
        }
        return { dryRun: input.apply !== true, scanned: rows.length, eligible, updated };
    },
});
