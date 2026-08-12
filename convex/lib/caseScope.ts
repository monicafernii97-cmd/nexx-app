import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';

/**
 * Validate a case and determine whether it owns pre-multi-case legacy rows.
 * Legacy rows are visible only in the user's oldest case until the optional
 * backfill is explicitly run.
 */
export async function resolveCaseScope(
    ctx: QueryCtx,
    userId: Id<'users'>,
    caseId: Id<'cases'>,
) {
    const selectedCase = await ctx.db.get(caseId);
    if (!selectedCase || selectedCase.userId !== userId) {
        throw new Error('Not authorized to access this case');
    }

    const oldestCase = await ctx.db
        .query('cases')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
        .order('asc')
        .first();

    return {
        includeLegacy: oldestCase?._id === caseId,
    };
}
