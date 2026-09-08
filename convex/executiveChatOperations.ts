import { internalMutation, mutation, query, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import { deriveExecutiveChatMetrics } from './lib/executiveChatMetrics';
import { estimateProviderCostMicrousd } from '../src/lib/nexx/provider/usageAccounting';

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

function percentile95(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

const KNOWN_FALLBACK = /cannot verify a complete answer from the order language available for this turn|safest practical next step based on the information available/i;

async function collectOperationalHealth(ctx: MutationCtx, environment: 'preview' | 'production') {
  const now = Date.now();
  const since = now - WINDOW_MS;
  const [turns, publications, repairs, reviewRuns, retrievals, canaries, manifests, configs, interactionResolutions, generationAttempts, toolReceipts, escalationReceipts] = await Promise.all([
    ctx.db.query('chatTurns').withIndex('by_created', (q) => q.gte('createdAt', since)).order('desc').take(MAX_ROWS),
    ctx.db.query('responsePublicationAudits').withIndex('by_created', (q) => q.gte('createdAt', since)).order('desc').take(MAX_ROWS),
    ctx.db.query('conversationRepairAudits').withIndex('by_created', (q) => q.gte('createdAt', since)).order('desc').take(MAX_ROWS),
    ctx.db.query('documentUnderstandingRuns').withIndex('by_created', (q) => q.gte('createdAt', since)).order('desc').take(MAX_ROWS),
    ctx.db.query('documentRetrievalAudit').withIndex('by_created', (q) => q.gte('createdAt', since)).order('desc').take(MAX_ROWS),
    ctx.db.query('chatQualityCanaryRuns').withIndex('by_scenario_created', (q) => q.eq('scenarioId', 'executive-chat-critical-matrix-v3')).order('desc').take(3),
    ctx.db.query('releaseManifests').withIndex('by_environment_active', (q) => q.eq('environment', environment).eq('active', true)).collect(),
    ctx.db.query('executiveChatRolloutConfigs').withIndex('by_environment_status', (q) => q.eq('environment', environment).eq('status', 'active')).order('desc').take(1),
    ctx.db.query('interactionResolutionAudits').withIndex('by_created', (q) => q.gte('createdAt', since)).order('desc').take(MAX_ROWS),
    ctx.db.query('chatGenerationAttempts').withIndex('by_created', (q) => q.gte('createdAt', since)).order('desc').take(MAX_ROWS),
    ctx.db.query('toolCallReceipts').withIndex('by_created', (q) => q.gte('createdAt', since)).order('desc').take(MAX_ROWS),
    ctx.db.query('modelEscalationReceipts').withIndex('by_created', (q) => q.gte('createdAt', since)).order('desc').take(MAX_ROWS),
  ]);

  const recentTurns = turns.slice(0, 250);
  const orchestration = await Promise.all(recentTurns.map(async (turn) => {
    const [understanding, plan, assistant, conversation] = await Promise.all([
      turn.understandingId ? ctx.db.get(turn.understandingId) : null,
      turn.executionPlanId ? ctx.db.get(turn.executionPlanId) : null,
      turn.assistantMessageId ? ctx.db.get(turn.assistantMessageId) : null,
      ctx.db.get(turn.conversationId),
    ]);
    const selectedDocuments = await Promise.all((plan?.selectedDocumentIds ?? []).map((id) => ctx.db.get(id)));
    return { turn, understanding, plan, assistant, conversation, selectedDocuments };
  }));
  const isProductionTurn = (turn: typeof turns[number]) =>
    (turn.dataProvenance ?? 'production') === 'production';
  const productionOrchestration = orchestration.filter(({ turn }) => isProductionTurn(turn));
  const syntheticOrchestration = orchestration.filter(({ turn }) => !isProductionTurn(turn));
  const productionTurnIds = new Set(turns.filter(isProductionTurn).map((turn) => turn._id.toString()));
  const productionPublications = publications.filter((row) => productionTurnIds.has(row.turnId.toString()));
  const productionRepairs = repairs.filter((row) => productionTurnIds.has(row.currentTurnId.toString()));
  const productionInteractionResolutions = interactionResolutions.filter((row) => productionTurnIds.has(row.turnId.toString()));
  const productionGenerationAttempts = generationAttempts.filter((row) => productionTurnIds.has(row.turnId.toString()));
  const productionToolReceipts = toolReceipts.filter((row) => productionTurnIds.has(row.turnId.toString()));
  const productionEscalationReceipts = escalationReceipts.filter((row) => productionTurnIds.has(row.turnId.toString()));
  const productionRetrievals = retrievals.filter((row) => productionTurnIds.has(row.turnId.toString()));
  const productionReviewRuns = reviewRuns.filter((run) => (run.dataProvenance ?? 'production') === 'production');
  const retrievalTurnIds = new Set(productionRetrievals.map((row) => row.turnId.toString()));
  const socialDocumentActivations = productionOrchestration.filter(({ understanding, plan }) =>
    understanding?.speechAct === 'social' && (plan?.selectedDocumentIds.length ?? 0) > 0
  ).length;
  const awaitingUploadRetrievals = productionOrchestration.filter(({ turn, understanding }) =>
    understanding?.requestedOperation === 'await_upload' && retrievalTurnIds.has(turn._id.toString())
  ).length;
  const terminalTurns = turns.filter((turn) => isProductionTurn(turn) &&
    ['assistant_saved', 'clarification_saved', 'degraded_saved', 'failed_retryable', 'failed_final', 'cancelled'].includes(turn.status));
  const unexplainedFallbacks = terminalTurns.filter((turn) => turn.status === 'degraded_saved' || turn.errorCode === 'minimal_fallback').length;
  const publicationWithoutEnvelope = terminalTurns.filter((turn) => turn.status === 'assistant_saved' && !turn.publicationEnvelopeId).length;
  const exhaustedRepairs = productionRepairs.filter((repair) => repair.status === 'exhausted').length;
  const loopBudgetViolations = productionRepairs.filter((repair) => repair.attempt > repair.maxAttempts).length;
  const rejectedPublications = productionPublications.filter((publication) => publication.decision === 'rejected').length;
  const shadowPublicationBlocks = productionPublications.filter((publication) => (publication.shadowRejectionCodes?.length ?? 0) > 0).length;
  const falseAvailabilityPublications = productionPublications.filter((publication) =>
    (publication.shadowRejectionCodes ?? []).includes('RESP_SELECTED_DOCUMENT_FALSE_UNAVAILABLE') ||
    publication.rejectionCodes.includes('RESP_SELECTED_DOCUMENT_FALSE_UNAVAILABLE')
  ).length;
  const acceptedActionNotExecuted = productionPublications.filter((publication) =>
    (publication.shadowRejectionCodes ?? []).includes('RESP_ACCEPTED_ACTION_NOT_EXECUTED') ||
    publication.rejectionCodes.includes('RESP_ACCEPTED_ACTION_NOT_EXECUTED')
  ).length;
  const completedReviewRuns = productionReviewRuns.filter((run) => ['ready', 'partial', 'failed', 'dead_letter'].includes(run.status));
  const successfulReviewRuns = completedReviewRuns.filter((run) => run.status === 'ready').length;
  const resumedReviewRuns = productionReviewRuns.filter((run) => (run.resumeCount ?? 0) > 0).length;
  const web = manifests.find((manifest) => manifest.runtime === 'web');
  const convex = manifests.find((manifest) => manifest.runtime === 'convex');
  const releaseGitSha = web && convex && web.gitSha === convex.gitSha ? web.gitSha : undefined;
  const evaluationRows = releaseGitSha
    ? await ctx.db.query('conversationKernelEvaluations')
      .withIndex('by_release_created', (q) => q.eq('releaseGitSha', releaseGitSha))
      .order('desc')
      .take(MAX_ROWS)
    : [];
  const latestEvaluationRunId = evaluationRows[0]?.runId;
  const latestEvaluationRows = latestEvaluationRunId
    ? evaluationRows.filter((row) => row.runId === latestEvaluationRunId)
    : [];
  const evaluationCreatedAt = latestEvaluationRows.length > 0
    ? Math.max(...latestEvaluationRows.map((row) => row.createdAt))
    : undefined;
  const evaluationCategories = latestEvaluationRows.map((row) => {
    try { return (JSON.parse(row.metricsJson) as { category?: string }).category ?? 'unknown'; }
    catch { return 'unknown'; }
  });
  const modelPolicyEvaluation = {
    runId: latestEvaluationRunId,
    total: latestEvaluationRows.length,
    passed: latestEvaluationRows.filter((row) => row.outcome === 'passed').length,
    failed: latestEvaluationRows.filter((row) => row.outcome === 'failed').length,
    needsReview: latestEvaluationRows.filter((row) => row.outcome === 'needs_review').length,
    frozenTotal: evaluationCategories.filter((category) => category === 'frozen_incident').length,
    frozenPassed: latestEvaluationRows.filter((row, index) =>
      evaluationCategories[index] === 'frozen_incident' && row.outcome === 'passed').length,
    candidateModels: Object.fromEntries(Array.from(new Set(latestEvaluationRows.map((row) => row.candidateModel))).map((model) => [
      model,
      latestEvaluationRows.filter((row) => row.candidateModel === model).length,
    ])),
    createdAt: evaluationCreatedAt,
    stale: evaluationCreatedAt !== undefined && now - evaluationCreatedAt > 24 * 60 * 60 * 1000,
    complete: latestEvaluationRows.length >= 226,
    failureCodes: Array.from(new Set(latestEvaluationRows.flatMap((row) => row.failureCodes))),
  };
  const activeRolloutConfigVersion = configs[0]?.version;
  const releaseCohortStartedAt = web && convex
    ? Math.max(web.deployedAt, convex.deployedAt, configs[0]?.activatedAt ?? 0)
    : undefined;
  const inCurrentRelease = (row: { createdAt: number; releaseGitSha?: string }) => {
    if (!releaseGitSha || releaseCohortStartedAt === undefined) return false;
    return row.releaseGitSha !== undefined
      ? row.releaseGitSha === releaseGitSha
      : row.createdAt >= releaseCohortStartedAt;
  };
  const currentReleaseTurnIds = new Set(turns.filter((turn) =>
    isProductionTurn(turn) &&
    inCurrentRelease(turn) &&
    activeRolloutConfigVersion !== undefined &&
    turn.rolloutConfigVersion === activeRolloutConfigVersion
  ).map((turn) => turn._id.toString()));
  const releaseTurns = terminalTurns.filter((turn) => currentReleaseTurnIds.has(turn._id.toString()));
  const releasePublications = publications.filter((publication) => currentReleaseTurnIds.has(publication.turnId.toString()));
  const releaseRepairs = repairs.filter((repair) => currentReleaseTurnIds.has(repair.currentTurnId.toString()));
  const releaseReviewRuns = completedReviewRuns.filter(inCurrentRelease);
  const releaseInteractionResolutions = interactionResolutions.filter((resolution) => currentReleaseTurnIds.has(resolution.turnId.toString()));
  const releaseGenerationAttempts = generationAttempts.filter((attempt) => currentReleaseTurnIds.has(attempt.turnId.toString()));
  const releaseToolReceipts = toolReceipts.filter((receipt) => currentReleaseTurnIds.has(receipt.turnId.toString()));
  const releaseEscalationReceipts = escalationReceipts.filter((receipt) => currentReleaseTurnIds.has(receipt.turnId.toString()));
  const releaseRetrievalTurnIds = new Set(retrievals
    .filter((row) => currentReleaseTurnIds.has(row.turnId.toString()))
    .map((row) => row.turnId.toString()));
  const releaseOrchestration = productionOrchestration.filter(({ turn }) => currentReleaseTurnIds.has(turn._id.toString()));
  const syntheticTurnIds = new Set(syntheticOrchestration.map(({ turn }) => turn._id.toString()));
  const syntheticPublications = publications.filter((publication) => syntheticTurnIds.has(publication.turnId.toString()));
  const syntheticAttempts = generationAttempts.filter((attempt) => syntheticTurnIds.has(attempt.turnId.toString()));
  const syntheticToolReceipts = toolReceipts.filter((receipt) => syntheticTurnIds.has(receipt.turnId.toString()));
  const releaseUnexplainedFallbacks = releaseTurns.filter((turn) =>
    turn.status === 'degraded_saved' || turn.errorCode === 'minimal_fallback').length;
  const releasePublicationWithoutEnvelope = releaseTurns.filter((turn) =>
    turn.status === 'assistant_saved' && !turn.publicationEnvelopeId).length;
  const releaseExhaustedRepairs = releaseRepairs.filter((repair) => repair.status === 'exhausted').length;
  const releaseLoopBudgetViolations = releaseRepairs.filter((repair) => repair.attempt > repair.maxAttempts).length;
  const releaseRejectedPublications = releasePublications.filter((publication) => publication.decision === 'rejected').length;
  const releaseSocialDocumentActivations = releaseOrchestration.filter(({ understanding, plan }) =>
    understanding?.speechAct === 'social' && (plan?.selectedDocumentIds.length ?? 0) > 0).length;
  const releaseAwaitingUploadRetrievals = releaseOrchestration.filter(({ turn, understanding }) =>
    understanding?.requestedOperation === 'await_upload' && releaseRetrievalTurnIds.has(turn._id.toString())).length;
  const releaseFalseAvailabilityPublications = releasePublications.filter((publication) =>
    (publication.shadowRejectionCodes ?? []).includes('RESP_SELECTED_DOCUMENT_FALSE_UNAVAILABLE') ||
    publication.rejectionCodes.includes('RESP_SELECTED_DOCUMENT_FALSE_UNAVAILABLE')).length;
  const releaseSuccessfulReviewRuns = releaseReviewRuns.filter((run) => run.status === 'ready').length;
  const releaseKnownFallbacks = releaseOrchestration.filter(({ assistant }) => Boolean(assistant && KNOWN_FALLBACK.test(assistant.content))).length;
  const naturalTurnIds = new Set(releaseOrchestration
    .filter(({ turn }) => {
      try { return (JSON.parse(turn.shadowKernelDecisionJson ?? '{}') as { responseProfile?: string }).responseProfile === 'natural'; }
      catch { return false; }
    })
    .map(({ turn }) => turn._id.toString()));
  const unnecessaryToolCalls = releaseToolReceipts.filter((receipt) => naturalTurnIds.has(receipt.turnId.toString())).length;
  const approvedSolEscalations = releaseEscalationReceipts.filter((receipt) => receipt.decision === 'approved' && receipt.requestedModel === 'gpt-5.6-sol').length;
  const toMetricContext = ({ turn, understanding, plan, conversation, selectedDocuments }: typeof orchestration[number]) => ({
    turn: {
      id: turn._id.toString(),
      conversationId: turn.conversationId.toString(),
      requestId: turn.requestId,
      status: turn.status,
      outcomeType: turn.outcomeType,
      taskTransitionsJson: turn.taskTransitionsJson,
      createdAt: turn.createdAt,
    },
    speechAct: understanding?.speechAct,
    requestedOperation: understanding?.requestedOperation,
    documentActivationJson: plan?.documentActivationJson,
    selectedDocumentIds: (plan?.selectedDocumentIds ?? []).map(String),
    conversationProvenance: turn.dataProvenance ?? conversation?.dataProvenance ?? 'production' as const,
    selectedDocumentProvenances: selectedDocuments
      .filter((document) => document !== null)
      .map((document) => document.dataProvenance ?? 'production'),
  });
  const toMetricPublication = (publication: typeof publications[number]) => ({
    turnId: publication.turnId.toString(),
    envelopeId: publication.envelopeId,
    decision: publication.decision,
    rejectionCodes: publication.rejectionCodes,
    shadowRejectionCodes: publication.shadowRejectionCodes,
  });
  const toMetricAttempt = (attempt: typeof generationAttempts[number]) => ({
    turnId: attempt.turnId.toString(),
    attemptNumber: attempt.attemptNumber,
    strategy: attempt.strategy,
    status: attempt.status,
    incompleteReason: attempt.incompleteReason,
    estimatedCostMicrousd: attempt.estimatedCostMicrousd,
  });
  const toMetricToolReceipt = (receipt: typeof toolReceipts[number]) => ({
    turnId: receipt.turnId.toString(),
    status: receipt.status,
    failureCode: receipt.failureCode,
    sideEffect: receipt.sideEffect,
    confirmationId: receipt.confirmationId,
  });
  const detailedMetrics = deriveExecutiveChatMetrics({
    contexts: productionOrchestration.map(toMetricContext),
    publications: productionPublications.map(toMetricPublication),
    attempts: productionGenerationAttempts.map(toMetricAttempt),
    toolReceipts: productionToolReceipts.map(toMetricToolReceipt),
  });
  const releaseDetailedMetrics = deriveExecutiveChatMetrics({
    contexts: releaseOrchestration.map(toMetricContext),
    publications: releasePublications.map(toMetricPublication),
    attempts: releaseGenerationAttempts.map(toMetricAttempt),
    toolReceipts: releaseToolReceipts.map(toMetricToolReceipt),
  });
  const syntheticDetailedMetrics = deriveExecutiveChatMetrics({
    contexts: syntheticOrchestration.map(toMetricContext),
    publications: syntheticPublications.map(toMetricPublication),
    attempts: syntheticAttempts.map(toMetricAttempt),
    toolReceipts: syntheticToolReceipts.map(toMetricToolReceipt),
  });
  const releaseSuccessfulTurnIds = new Set(releaseTurns
    .filter((turn) => turn.status === 'assistant_saved' || turn.status === 'clarification_saved')
    .map((turn) => turn._id.toString()));
  const releaseSuccessfulAttempts = releaseGenerationAttempts.filter((attempt) =>
    attempt.status === 'completed' && releaseSuccessfulTurnIds.has(attempt.turnId.toString()));
  const releaseGpt54CounterfactualMicrousd = releaseSuccessfulAttempts.reduce((sum, attempt) => {
    if (attempt.inputTokens === undefined || attempt.outputTokens === undefined) return sum;
    return sum + (estimateProviderCostMicrousd('gpt-5.4', {
      inputTokens: attempt.inputTokens,
      cachedInputTokens: attempt.cachedInputTokens ?? 0,
      outputTokens: attempt.outputTokens,
      reasoningTokens: attempt.reasoningTokens ?? 0,
      totalTokens: attempt.totalTokens ?? attempt.inputTokens + attempt.outputTokens + (attempt.reasoningTokens ?? 0),
    }) ?? 0);
  }, 0);
  const releaseSuccessfulCostMicrousd = releaseSuccessfulAttempts.reduce((sum, attempt) =>
    sum + (attempt.estimatedCostMicrousd ?? 0), 0);
  const legacyGpt54Attempts = productionGenerationAttempts.filter((attempt) => attempt.model === 'gpt-5.4');
  const legacyGpt54P95CompletionLatencyMs = percentile95(legacyGpt54Attempts.flatMap((attempt) =>
    attempt.totalLatencyMs === undefined ? [] : [attempt.totalLatencyMs]));
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
    publications: productionPublications.length,
    rejectedPublications,
    publicationRejectionRate: rate(rejectedPublications, productionPublications.length),
    shadowPublicationBlocks,
    shadowPublicationBlockRate: rate(shadowPublicationBlocks, productionPublications.filter((publication) => publication.rolloutMode === 'shadow').length),
    publicationWithoutEnvelope,
    interactionResolutions: productionInteractionResolutions.length,
    executedInteractionResolutions: productionInteractionResolutions.filter((resolution) => resolution.decision === 'execute').length,
    clarifiedInteractionResolutions: productionInteractionResolutions.filter((resolution) => resolution.decision === 'clarify').length,
    recommendationAcceptances: productionInteractionResolutions.filter((resolution) => resolution.intent === 'accept_recommendation').length,
    semanticClassifierExecutions: productionInteractionResolutions.filter((resolution) =>
      resolution.classifierVersion === 'semantic-interaction-model-v1' && resolution.decision === 'execute'
    ).length,
    semanticClassifierFallbacks: productionInteractionResolutions.filter((resolution) =>
      resolution.classifierVersion === 'semantic-interaction-model-v1' && resolution.decision !== 'execute'
    ).length,
    falseAvailabilityPublications,
    acceptedActionNotExecuted,
    repairs: productionRepairs.length,
    successfulRepairs: productionRepairs.filter((repair) => repair.status === 'succeeded').length,
    exhaustedRepairs,
    repairExhaustionRate: rate(exhaustedRepairs, productionRepairs.length),
    loopBudgetViolations,
    socialDocumentActivations,
    awaitingUploadRetrievals,
    reviewRuns: completedReviewRuns.length,
    successfulReviewRuns,
    durableReviewCompletionRate: rate(successfulReviewRuns, completedReviewRuns.length),
    resumedReviewRuns,
    canaryStatus: canaries[0]?.status ?? 'missing',
    canaryStale,
    generationAttempts: productionGenerationAttempts.length,
    attemptsWithActualUsage: productionGenerationAttempts.filter((attempt) => attempt.totalTokens !== undefined).length,
    inputTokens: productionGenerationAttempts.reduce((sum, attempt) => sum + (attempt.inputTokens ?? 0), 0),
    cachedInputTokens: productionGenerationAttempts.reduce((sum, attempt) => sum + (attempt.cachedInputTokens ?? 0), 0),
    outputTokens: productionGenerationAttempts.reduce((sum, attempt) => sum + (attempt.outputTokens ?? 0), 0),
    reasoningTokens: productionGenerationAttempts.reduce((sum, attempt) => sum + (attempt.reasoningTokens ?? 0), 0),
    estimatedCostUsd: Number((productionGenerationAttempts.reduce((sum, attempt) =>
      sum + (attempt.estimatedCostMicrousd ?? 0), 0) / 1_000_000).toFixed(6)),
    ...detailedMetrics,
  };
  const releaseMetrics = {
    eligibleTurns: releaseTurns.length,
    unexplainedFallbacks: releaseUnexplainedFallbacks,
    unexplainedFallbackRate: rate(releaseUnexplainedFallbacks, releaseTurns.length),
    publications: releasePublications.length,
    rejectedPublications: releaseRejectedPublications,
    publicationRejectionRate: rate(releaseRejectedPublications, releasePublications.length),
    publicationWithoutEnvelope: releasePublicationWithoutEnvelope,
    repairs: releaseRepairs.length,
    exhaustedRepairs: releaseExhaustedRepairs,
    repairExhaustionRate: rate(releaseExhaustedRepairs, releaseRepairs.length),
    loopBudgetViolations: releaseLoopBudgetViolations,
    socialDocumentActivations: releaseSocialDocumentActivations,
    awaitingUploadRetrievals: releaseAwaitingUploadRetrievals,
    falseAvailabilityPublications: releaseFalseAvailabilityPublications,
    interactionResolutions: releaseInteractionResolutions.length,
    reviewRuns: releaseReviewRuns.length,
    successfulReviewRuns: releaseSuccessfulReviewRuns,
    durableReviewCompletionRate: rate(releaseSuccessfulReviewRuns, releaseReviewRuns.length),
    generationAttempts: releaseGenerationAttempts.length,
    attemptsWithActualUsage: releaseGenerationAttempts.filter((attempt) => attempt.totalTokens !== undefined).length,
    actualUsageCoverage: rate(
      releaseGenerationAttempts.filter((attempt) => attempt.totalTokens !== undefined || Boolean(attempt.usageUnavailableReason)).length,
      releaseGenerationAttempts.length,
    ),
    toolCalls: releaseToolReceipts.length,
    unnecessaryToolCalls,
    unnecessaryToolUseRate: rate(unnecessaryToolCalls, releaseTurns.length),
    approvedEscalations: releaseEscalationReceipts.filter((receipt) => receipt.decision === 'approved').length,
    approvedSolEscalations,
    solTurnRate: rate(new Set(releaseGenerationAttempts.filter((attempt) => attempt.model === 'gpt-5.6-sol').map((attempt) => attempt.turnId.toString())).size, releaseTurns.length),
    knownFallbackPublications: releaseKnownFallbacks,
    p95FirstTokenLatencyMs: percentile95(releaseGenerationAttempts.flatMap((attempt) => attempt.firstTokenLatencyMs === undefined ? [] : [attempt.firstTokenLatencyMs])),
    p95CompletionLatencyMs: percentile95(releaseGenerationAttempts.flatMap((attempt) => attempt.totalLatencyMs === undefined ? [] : [attempt.totalLatencyMs])),
    inputTokens: releaseGenerationAttempts.reduce((sum, attempt) => sum + (attempt.inputTokens ?? 0), 0),
    cachedInputTokens: releaseGenerationAttempts.reduce((sum, attempt) => sum + (attempt.cachedInputTokens ?? 0), 0),
    outputTokens: releaseGenerationAttempts.reduce((sum, attempt) => sum + (attempt.outputTokens ?? 0), 0),
    reasoningTokens: releaseGenerationAttempts.reduce((sum, attempt) => sum + (attempt.reasoningTokens ?? 0), 0),
    estimatedCostUsd: Number((releaseGenerationAttempts.reduce((sum, attempt) =>
      sum + (attempt.estimatedCostMicrousd ?? 0), 0) / 1_000_000).toFixed(6)),
    gpt54CounterfactualSuccessfulCostUsd: Number((releaseGpt54CounterfactualMicrousd / 1_000_000).toFixed(6)),
    successfulCostSavingsVsGpt54: releaseGpt54CounterfactualMicrousd > 0
      ? 1 - (releaseSuccessfulCostMicrousd / releaseGpt54CounterfactualMicrousd)
      : 0,
    legacyGpt54P95CompletionLatencyMs,
    p95CompletionLatencyRegressionVsGpt54: legacyGpt54P95CompletionLatencyMs > 0
      ? (percentile95(releaseGenerationAttempts.flatMap((attempt) => attempt.totalLatencyMs === undefined ? [] : [attempt.totalLatencyMs])) / legacyGpt54P95CompletionLatencyMs) - 1
      : 0,
    modelPolicyEvaluation,
    ...releaseDetailedMetrics,
  };
  const rollingHardStopCodes = [
    ...(publicationWithoutEnvelope > 0 ? ['publication_without_envelope'] : []),
    ...(loopBudgetViolations > 0 ? ['self_correction_loop_budget_exceeded'] : []),
    ...(consecutiveCanaryFailures ? ['consecutive_semantic_canary_failures'] : []),
    ...(falseAvailabilityPublications > 0 ? ['false_document_unavailable_published'] : []),
    ...(detailedMetrics.qaProductionIsolationViolations > 0 ? ['qa_production_isolation_violation'] : []),
    ...(detailedMetrics.taskIdempotencyViolations > 0 ? ['task_idempotency_violation'] : []),
    ...(detailedMetrics.publicationIdempotencyViolations > 0 ? ['publication_idempotency_violation'] : []),
    ...(detailedMetrics.unauthorizedEvidencePublications > 0 ? ['unauthorized_evidence_published'] : []),
    ...(detailedMetrics.zeroDocumentAnalysisPublications > 0 ? ['zero_document_analysis_published'] : []),
    ...(detailedMetrics.falseToolOrActionClaimPublications > 0 ? ['false_tool_or_action_claim_published'] : []),
    ...(detailedMetrics.materialSideEffectsWithoutConfirmation > 0 ? ['material_side_effect_without_confirmation'] : []),
  ];
  const rollingSoftStopCodes = [
    ...(metrics.unexplainedFallbackRate > 0.01 ? ['fallback_rate_above_1_percent'] : []),
    ...(metrics.repairExhaustionRate > 0.005 ? ['repair_exhaustion_above_0_5_percent'] : []),
    ...(metrics.publicationRejectionRate > 0.01 ? ['publication_rejection_above_1_percent'] : []),
    ...(socialDocumentActivations > 0 ? ['document_activation_on_social_turn'] : []),
    ...(awaitingUploadRetrievals > 0 ? ['retrieval_while_awaiting_upload'] : []),
    ...(completedReviewRuns.length > 0 && metrics.durableReviewCompletionRate < 0.99 ? ['durable_review_completion_below_99_percent'] : []),
    ...(detailedMetrics.documentActivationFalsePositiveRate > 0.005 ? ['document_activation_false_positive_above_0_5_percent'] : []),
    ...(detailedMetrics.backgroundTaskResumes > 0 && detailedMetrics.backgroundTaskResumeSuccessRate < 0.98 ? ['background_task_resume_below_98_percent'] : []),
    ...(canaryStale ? ['semantic_canary_stale'] : []),
  ];
  const hardStopCodes = [
    ...(releaseMismatch ? ['release_manifest_identity_mismatch'] : []),
    ...(releasePublicationWithoutEnvelope > 0 ? ['publication_without_envelope'] : []),
    ...(releaseLoopBudgetViolations > 0 ? ['self_correction_loop_budget_exceeded'] : []),
    ...(consecutiveCanaryFailures ? ['consecutive_semantic_canary_failures'] : []),
    ...(releaseFalseAvailabilityPublications > 0 ? ['false_document_unavailable_published'] : []),
    ...(releaseKnownFallbacks > 0 ? ['known_canned_fallback_published'] : []),
    ...(releaseDetailedMetrics.qaProductionIsolationViolations > 0 ? ['qa_production_isolation_violation'] : []),
    ...(releaseDetailedMetrics.taskIdempotencyViolations > 0 ? ['task_idempotency_violation'] : []),
    ...(releaseDetailedMetrics.publicationIdempotencyViolations > 0 ? ['publication_idempotency_violation'] : []),
    ...(releaseDetailedMetrics.unauthorizedEvidencePublications > 0 ? ['unauthorized_evidence_published'] : []),
    ...(releaseDetailedMetrics.zeroDocumentAnalysisPublications > 0 ? ['zero_document_analysis_published'] : []),
    ...(releaseDetailedMetrics.falseToolOrActionClaimPublications > 0 ? ['false_tool_or_action_claim_published'] : []),
    ...(releaseDetailedMetrics.materialSideEffectsWithoutConfirmation > 0 ? ['material_side_effect_without_confirmation'] : []),
  ];
  const softStopCodes = [
    ...(releaseMetrics.unexplainedFallbackRate > 0.01 ? ['fallback_rate_above_1_percent'] : []),
    ...(releaseMetrics.repairExhaustionRate > 0.005 ? ['repair_exhaustion_above_0_5_percent'] : []),
    ...(releaseMetrics.publicationRejectionRate > 0.01 ? ['publication_rejection_above_1_percent'] : []),
    ...(releaseSocialDocumentActivations > 0 ? ['document_activation_on_social_turn'] : []),
    ...(releaseAwaitingUploadRetrievals > 0 ? ['retrieval_while_awaiting_upload'] : []),
    ...(releaseReviewRuns.length > 0 && releaseMetrics.durableReviewCompletionRate < 0.99 ? ['durable_review_completion_below_99_percent'] : []),
    ...(releaseGenerationAttempts.length > 0 && releaseMetrics.actualUsageCoverage < 0.99 ? ['actual_usage_coverage_below_99_percent'] : []),
    ...(releaseMetrics.unnecessaryToolUseRate > 0.02 ? ['unnecessary_tool_use_above_2_percent'] : []),
    ...(releaseMetrics.solTurnRate > 0.05 ? ['sol_usage_above_5_percent'] : []),
    ...(releaseDetailedMetrics.documentActivationFalsePositiveRate > 0.005 ? ['document_activation_false_positive_above_0_5_percent'] : []),
    ...(releaseDetailedMetrics.backgroundTaskResumes > 0 && releaseDetailedMetrics.backgroundTaskResumeSuccessRate < 0.98 ? ['background_task_resume_below_98_percent'] : []),
    ...(!modelPolicyEvaluation.runId ? ['model_policy_evaluation_missing'] : []),
    ...(modelPolicyEvaluation.runId && !modelPolicyEvaluation.complete ? ['model_policy_evaluation_incomplete'] : []),
    ...(modelPolicyEvaluation.failed > 0 || modelPolicyEvaluation.needsReview > 0 ? ['model_policy_evaluation_failed'] : []),
    ...(modelPolicyEvaluation.frozenTotal > 0 && modelPolicyEvaluation.frozenPassed !== modelPolicyEvaluation.frozenTotal ? ['frozen_incident_model_evaluation_failed'] : []),
    ...(modelPolicyEvaluation.stale ? ['model_policy_evaluation_stale'] : []),
    ...(releaseSuccessfulAttempts.length > 0 && releaseGpt54CounterfactualMicrousd > 0 && releaseMetrics.successfulCostSavingsVsGpt54 < 0.5 ? ['successful_turn_cost_savings_below_50_percent'] : []),
    ...(legacyGpt54P95CompletionLatencyMs > 0 && releaseGenerationAttempts.some((attempt) => attempt.totalLatencyMs !== undefined) && releaseMetrics.p95CompletionLatencyRegressionVsGpt54 > 0.2 ? ['p95_latency_regression_above_20_percent'] : []),
    ...(canaryStale ? ['semantic_canary_stale'] : []),
  ];
  const speechActs = Object.fromEntries(Array.from(new Set(productionOrchestration.map(({ understanding }) => understanding?.speechAct ?? 'missing'))).map((speechAct) => [
    speechAct,
    productionOrchestration.filter(({ understanding }) => (understanding?.speechAct ?? 'missing') === speechAct).length,
  ]));
  const rolloutVersions = Object.fromEntries(Array.from(new Set(terminalTurns.map((turn) => String(turn.rolloutConfigVersion ?? 0)))).map((version) => [
    version,
    terminalTurns.filter((turn) => String(turn.rolloutConfigVersion ?? 0) === version).length,
  ]));
  const models = Object.fromEntries(Array.from(new Set(productionGenerationAttempts.map((attempt) => attempt.model))).map((model) => [
    model,
    {
      attempts: productionGenerationAttempts.filter((attempt) => attempt.model === model).length,
      inputTokens: productionGenerationAttempts.filter((attempt) => attempt.model === model).reduce((sum, attempt) => sum + (attempt.inputTokens ?? 0), 0),
      outputTokens: productionGenerationAttempts.filter((attempt) => attempt.model === model).reduce((sum, attempt) => sum + (attempt.outputTokens ?? 0), 0),
      estimatedCostUsd: Number((productionGenerationAttempts.filter((attempt) => attempt.model === model).reduce((sum, attempt) =>
        sum + (attempt.estimatedCostMicrousd ?? 0), 0) / 1_000_000).toFixed(6)),
    },
  ]));
  const releaseModels = Object.fromEntries(Array.from(new Set(releaseGenerationAttempts.map((attempt) => attempt.model))).map((model) => [
    model,
    {
      attempts: releaseGenerationAttempts.filter((attempt) => attempt.model === model).length,
      inputTokens: releaseGenerationAttempts.filter((attempt) => attempt.model === model).reduce((sum, attempt) => sum + (attempt.inputTokens ?? 0), 0),
      outputTokens: releaseGenerationAttempts.filter((attempt) => attempt.model === model).reduce((sum, attempt) => sum + (attempt.outputTokens ?? 0), 0),
      estimatedCostUsd: Number((releaseGenerationAttempts.filter((attempt) => attempt.model === model).reduce((sum, attempt) =>
        sum + (attempt.estimatedCostMicrousd ?? 0), 0) / 1_000_000).toFixed(6)),
    },
  ]));
  const escalationReasons = Object.fromEntries(Array.from(new Set(productionEscalationReceipts.map((receipt) => receipt.reasonCode))).map((reasonCode) => [
    reasonCode,
    productionEscalationReceipts.filter((receipt) => receipt.reasonCode === reasonCode).length,
  ]));
  const releaseEscalationReasons = Object.fromEntries(Array.from(new Set(releaseEscalationReceipts.map((receipt) => receipt.reasonCode))).map((reasonCode) => [
    reasonCode,
    releaseEscalationReceipts.filter((receipt) => receipt.reasonCode === reasonCode).length,
  ]));
  return {
    environment,
    windowStartedAt: since,
    windowEndedAt: now,
    releaseGitSha,
    releaseCohortStartedAt,
    rolloutConfigVersion: configs[0]?.version,
    metrics,
    releaseMetrics,
    segments: {
      speechActs,
      rolloutVersions,
      models,
      releaseModels,
      escalationReasons,
      releaseEscalationReasons,
      provenance: {
        realProductionTurns: detailedMetrics.realProductionTurns,
        syntheticQaTurns: syntheticDetailedMetrics.syntheticQaTurns,
        syntheticQaMetrics: syntheticDetailedMetrics,
      },
    },
    hardStopCodes,
    softStopCodes,
    rollingHardStopCodes,
    rollingSoftStopCodes,
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
      releaseMetricsJson: JSON.stringify(health.releaseMetrics),
      segmentsJson: JSON.stringify(health.segments),
      rollingHardStopCodes: health.rollingHardStopCodes,
      rollingSoftStopCodes: health.rollingSoftStopCodes,
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
      releaseMetricsJson: JSON.stringify(health.releaseMetrics),
      segmentsJson: JSON.stringify(health.segments),
      rollingHardStopCodes: health.rollingHardStopCodes,
      rollingSoftStopCodes: health.rollingSoftStopCodes,
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
    return {
      ...row,
      metrics: JSON.parse(row.metricsJson),
      releaseMetrics: row.releaseMetricsJson ? JSON.parse(row.releaseMetricsJson) : undefined,
      segments: JSON.parse(row.segmentsJson),
      metricsJson: undefined,
      releaseMetricsJson: undefined,
      segmentsJson: undefined,
    };
  },
});
