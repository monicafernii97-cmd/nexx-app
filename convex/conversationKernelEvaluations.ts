import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const environmentValidator = v.union(v.literal('local'), v.literal('preview'), v.literal('production'));
const outcomeValidator = v.union(v.literal('passed'), v.literal('failed'), v.literal('needs_review'));

function requireReleaseSecret(secret: string) {
  const expected = process.env.VERIFICATION_SECRET;
  if (!expected || secret !== expected) throw new Error('conversation_kernel_evaluation_not_authorized');
}

const evaluationValidator = v.object({
  caseId: v.string(),
  kernelVersion: v.string(),
  modelPolicyVersion: v.string(),
  candidateModel: v.string(),
  baselineModel: v.optional(v.string()),
  published: v.boolean(),
  outcome: outcomeValidator,
  metricsJson: v.string(),
  failureCodes: v.array(v.string()),
});

/** Persist a bounded, idempotent page of sanitized model-policy results. */
export const recordBatch = mutation({
  args: {
    secret: v.string(),
    runId: v.string(),
    environment: environmentValidator,
    releaseGitSha: v.optional(v.string()),
    evaluations: v.array(evaluationValidator),
  },
  handler: async (ctx, args) => {
    requireReleaseSecret(args.secret);
    if (!args.runId.trim() || args.runId.length > 160 ||
      (args.releaseGitSha !== undefined && args.releaseGitSha.length > 64) ||
      args.evaluations.length === 0 || args.evaluations.length > 50) {
      throw new Error('conversation_kernel_evaluation_batch_invalid');
    }
    let inserted = 0;
    let duplicates = 0;
    for (const evaluation of args.evaluations) {
      if (!evaluation.caseId.trim() || evaluation.caseId.length > 160 || evaluation.metricsJson.length > 20_000 ||
        evaluation.failureCodes.length > 32 || evaluation.failureCodes.some((code) => code.length > 160)) {
        throw new Error('conversation_kernel_evaluation_record_invalid');
      }
      const existing = await ctx.db.query('conversationKernelEvaluations')
        .withIndex('by_run_case', (q) => q.eq('runId', args.runId).eq('caseId', evaluation.caseId))
        .first();
      if (existing) {
        duplicates += 1;
        continue;
      }
      await ctx.db.insert('conversationKernelEvaluations', {
        ...evaluation,
        runId: args.runId,
        environment: args.environment,
        releaseGitSha: args.releaseGitSha,
        createdAt: Date.now(),
      });
      inserted += 1;
    }
    return { runId: args.runId, inserted, duplicates };
  },
});

/** Return the latest run for an exact release without exposing response text. */
export const latestForRelease = query({
  args: { secret: v.string(), releaseGitSha: v.string() },
  handler: async (ctx, args) => {
    requireReleaseSecret(args.secret);
    const rows = await ctx.db.query('conversationKernelEvaluations')
      .withIndex('by_release_created', (q) => q.eq('releaseGitSha', args.releaseGitSha))
      .order('desc')
      .take(2_000);
    if (rows.length === 0) return null;
    const runId = rows[0].runId;
    const run = rows.filter((row) => row.runId === runId);
    return {
      runId,
      releaseGitSha: args.releaseGitSha,
      environment: run[0].environment,
      createdAt: Math.max(...run.map((row) => row.createdAt)),
      total: run.length,
      passed: run.filter((row) => row.outcome === 'passed').length,
      failed: run.filter((row) => row.outcome === 'failed').length,
      needsReview: run.filter((row) => row.outcome === 'needs_review').length,
      failureCodes: Array.from(new Set(run.flatMap((row) => row.failureCodes))),
    };
  },
});
