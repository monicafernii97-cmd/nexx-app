import { internalMutation, mutation, query, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS = 2_000;
const environmentValidator = v.union(v.literal('preview'), v.literal('production'));

function requireReleaseSecret(secret: string) {
  const expected = process.env.VERIFICATION_SECRET;
  if (!expected || secret !== expected) throw new Error('executive_chat_operations_not_authorized');
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

async function collectOperationalHealth(ctx: MutationCtx, environment: 'preview' | 'production') {
  const now = Date.now();
  const since = now - WINDOW_MS;
  const [turns, publications, repairs, reviewRuns, retrievals, canaries, manifests, configs] = await Promise.all([
    ctx.db.query('chatTurns').withIndex('by_created', (q) => q.gte('createdAt', since)).order('desc').take(MAX_ROWS),
    ctx.db.query('responsePublicationAudits').withIndex('by_created', (q) => q.gte('createdAt', since)).order('desc').take(MAX_ROWS),
    ctx.db.query('conversationRepairAudits').withIndex('by_created', (q) => q.gte('createdAt', since)).order('desc').take(MAX_ROWS),
    ctx.db.query('documentUnderstandingRuns').withIndex('by_created', (q) => q.gte('createdAt', since)).order('desc').take(MAX_ROWS),
    ctx.db.query('documentRetrievalAudit').withIndex('by_created', (q) => q.gte('createdAt', since)).order('desc').take(MAX_ROWS),
    ctx.db.query('chatQualityCanaryRuns').withIndex('by_scenario_created', (q) => q.eq('scenarioId', 'executive-chat-critical-matrix-v2')).order('desc').take(3),
    ctx.db.query('releaseManifests').withIndex('by_environment_active', (q) => q.eq('environment', environment).eq('active', true)).collect(),
    ctx.db.query('executiveChatRolloutConfigs').withIndex('by_environment_status', (q) => q.eq('environment', environment).eq('status', 'active')).order('desc').take(1),
  ]);

  const recentTurns = turns.slice(0, 250);
  const orchestration = await Promise.all(recentTurns.map(async (turn) => ({
    turn,
    understanding: turn.understandingId ? await ctx.db.get(turn.understandingId) : null,
    plan: turn.executionPlanId ? await ctx.db.get(turn.executionPlanId) : null,
  })));
  const retrievalTurnIds = new Set(retrievals.map((row) => row.turnId.toString()));
  const socialDocumentActivations = orchestration.filter(({ understanding, plan }) =>
    understanding?.speechAct === 'social' && (plan?.selectedDocumentIds.length ?? 0) > 0
  ).length;
  const awaitingUploadRetrievals = orchestration.filter(({ turn, understanding }) =>
    understanding?.requestedOperation === 'await_upload' && retrievalTurnIds.has(turn._id.toString())
  ).length;
  const terminalTurns = turns.filter((turn) => ['assistant_saved', 'degraded_saved', 'failed_retryable', 'failed_final'].includes(turn.status));
  const unexplainedFallbacks = terminalTurns.filter((turn) => turn.status === 'degraded_saved' || turn.errorCode === 'minimal_fallback').length;
  const publicationWithoutEnvelope = terminalTurns.filter((turn) => turn.status === 'assistant_saved' && !turn.publicationEnvelopeId).length;
  const exhaustedRepairs = repairs.filter((repair) => repair.status === 'exhausted').length;
  const loopBudgetViolations = repairs.filter((repair) => repair.attempt > repair.maxAttempts).length;
  const rejectedPublications = publications.filter((publication) => publication.decision === 'rejected').length;
  const shadowPublicationBlocks = publications.filter((publication) => (publication.shadowRejectionCodes?.length ?? 0) > 0).length;
  const completedReviewRuns = reviewRuns.filter((run) => ['ready', 'partial', 'failed', 'dead_letter'].includes(run.status));
  const successfulReviewRuns = completedReviewRuns.filter((run) => run.status === 'ready').length;
  const resumedReviewRuns = reviewRuns.filter((run) => (run.resumeCount ?? 0) > 0).length;
  const web = manifests.find((manifest) => manifest.runtime === 'web');
  const convex = manifests.find((manifest) => manifest.runtime === 'convex');
  const releaseMismatch = !web || !convex || web.gitSha !== convex.gitSha ||
    web.schemaVersion !== convex.schemaVersion || web.controlVersion !== convex.controlVersion ||
    web.capabilityVersion !== convex.capabilityVersion || web.validatorVersion !== convex.validatorVersion ||
    web.promptPolicyVersion !== convex.promptPolicyVersion;
  const consecutiveCanaryFailures = canaries.length >= 2 && canaries.slice(0, 2).every((run) => run.status === 'failed');
  const canaryStale = !canaries[0] || now - canaries[0].createdAt > 30 * 60 * 1000;

  const metrics = {
    eligibleTurns: terminalTurns.length,
    traceCompleteTurns: terminalTurns.filter((turn) => turn.taskId && turn.understandingId && turn.executionPlanId).length,
    unexplainedFallbacks,
    unexplainedFallbackRate: rate(unexplainedFallbacks, terminalTurns.length),
    publications: publications.length,
    rejectedPublications,
    publicationRejectionRate: rate(rejectedPublications, publications.length),
    shadowPublicationBlocks,
    shadowPublicationBlockRate: rate(shadowPublicationBlocks, publications.filter((publication) => publication.rolloutMode === 'shadow').length),
    publicationWithoutEnvelope,
    repairs: repairs.length,
    successfulRepairs: repairs.filter((repair) => repair.status === 'succeeded').length,
    exhaustedRepairs,
    repairExhaustionRate: rate(exhaustedRepairs, repairs.length),
    loopBudgetViolations,
    socialDocumentActivations,
    awaitingUploadRetrievals,
    reviewRuns: completedReviewRuns.length,
    successfulReviewRuns,
    durableReviewCompletionRate: rate(successfulReviewRuns, completedReviewRuns.length),
    resumedReviewRuns,
    canaryStatus: canaries[0]?.status ?? 'missing',
    canaryStale,
  };
  const hardStopCodes = [
    ...(releaseMismatch ? ['release_manifest_identity_mismatch'] : []),
    ...(publicationWithoutEnvelope > 0 ? ['publication_without_envelope'] : []),
    ...(loopBudgetViolations > 0 ? ['self_correction_loop_budget_exceeded'] : []),
    ...(consecutiveCanaryFailures ? ['consecutive_semantic_canary_failures'] : []),
  ];
  const softStopCodes = [
    ...(metrics.unexplainedFallbackRate > 0.01 ? ['fallback_rate_above_1_percent'] : []),
    ...(metrics.repairExhaustionRate > 0.005 ? ['repair_exhaustion_above_0_5_percent'] : []),
    ...(metrics.publicationRejectionRate > 0.01 ? ['publication_rejection_above_1_percent'] : []),
    ...(socialDocumentActivations > 0 ? ['document_activation_on_social_turn'] : []),
    ...(awaitingUploadRetrievals > 0 ? ['retrieval_while_awaiting_upload'] : []),
    ...(completedReviewRuns.length > 0 && metrics.durableReviewCompletionRate < 0.99 ? ['durable_review_completion_below_99_percent'] : []),
    ...(canaryStale ? ['semantic_canary_stale'] : []),
  ];
  const speechActs = Object.fromEntries(Array.from(new Set(orchestration.map(({ understanding }) => understanding?.speechAct ?? 'missing'))).map((speechAct) => [
    speechAct,
    orchestration.filter(({ understanding }) => (understanding?.speechAct ?? 'missing') === speechAct).length,
  ]));
  const rolloutVersions = Object.fromEntries(Array.from(new Set(turns.map((turn) => String(turn.rolloutConfigVersion ?? 0)))).map((version) => [
    version,
    turns.filter((turn) => String(turn.rolloutConfigVersion ?? 0) === version).length,
  ]));
  return {
    environment,
    windowStartedAt: since,
    windowEndedAt: now,
    releaseGitSha: web?.gitSha,
    rolloutConfigVersion: configs[0]?.version,
    metrics,
    segments: { speechActs, rolloutVersions },
    hardStopCodes,
    softStopCodes,
    healthy: hardStopCodes.length === 0 && softStopCodes.length === 0,
  };
}

export const audit = internalMutation({
  args: {},
  handler: async (ctx) => {
    const health = await collectOperationalHealth(ctx, 'production');
    const snapshotId = await ctx.db.insert('executiveChatOperationalSnapshots', {
      environment: health.environment,
      windowStartedAt: health.windowStartedAt,
      windowEndedAt: health.windowEndedAt,
      releaseGitSha: health.releaseGitSha,
      rolloutConfigVersion: health.rolloutConfigVersion,
      metricsJson: JSON.stringify(health.metrics),
      segmentsJson: JSON.stringify(health.segments),
      hardStopCodes: health.hardStopCodes,
      softStopCodes: health.softStopCodes,
      healthy: health.healthy,
      createdAt: Date.now(),
    });
    if (health.hardStopCodes.length > 0) console.error(JSON.stringify({ level: 'critical', event: 'executive_chat_rollout_hard_stop', snapshotId, codes: health.hardStopCodes }));
    else if (health.softStopCodes.length > 0) console.warn(JSON.stringify({ level: 'warning', event: 'executive_chat_rollout_soft_stop', snapshotId, codes: health.softStopCodes }));
    return { snapshotId, healthy: health.healthy, hardStopCodes: health.hardStopCodes, softStopCodes: health.softStopCodes };
  },
});

export const auditForRelease = mutation({
  args: { secret: v.string(), environment: environmentValidator },
  handler: async (ctx, args) => {
    requireReleaseSecret(args.secret);
    const health = await collectOperationalHealth(ctx, args.environment);
    const snapshotId = await ctx.db.insert('executiveChatOperationalSnapshots', {
      environment: health.environment,
      windowStartedAt: health.windowStartedAt,
      windowEndedAt: health.windowEndedAt,
      releaseGitSha: health.releaseGitSha,
      rolloutConfigVersion: health.rolloutConfigVersion,
      metricsJson: JSON.stringify(health.metrics),
      segmentsJson: JSON.stringify(health.segments),
      hardStopCodes: health.hardStopCodes,
      softStopCodes: health.softStopCodes,
      healthy: health.healthy,
      createdAt: Date.now(),
    });
    return { ...health, snapshotId };
  },
});

export const latestForRelease = query({
  args: { secret: v.string(), environment: environmentValidator },
  handler: async (ctx, args) => {
    requireReleaseSecret(args.secret);
    const row = await ctx.db.query('executiveChatOperationalSnapshots').withIndex('by_environment_created', (q) => q.eq('environment', args.environment)).order('desc').first();
    if (!row) return null;
    return { ...row, metrics: JSON.parse(row.metricsJson), segments: JSON.parse(row.segmentsJson), metricsJson: undefined, segmentsJson: undefined };
  },
});
