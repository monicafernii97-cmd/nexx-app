export type OperationalTurn = {
  id: string;
  conversationId: string;
  requestId: string;
  status: string;
  outcomeType?: string;
  taskTransitionsJson?: string;
  createdAt: number;
};

export type OperationalTurnContext = {
  turn: OperationalTurn;
  speechAct?: string;
  requestedOperation?: string;
  documentActivationJson?: string;
  selectedDocumentIds: string[];
  conversationProvenance: 'production' | 'qa' | 'synthetic';
  selectedDocumentProvenances: Array<'production' | 'qa' | 'synthetic'>;
};

export type OperationalPublication = {
  turnId: string;
  envelopeId: string;
  decision: string;
  rejectionCodes: string[];
  shadowRejectionCodes?: string[];
};

export type OperationalAttempt = {
  turnId: string;
  attemptNumber: number;
  strategy: string;
  status: string;
  incompleteReason?: string;
  estimatedCostMicrousd?: number;
};

export type OperationalToolReceipt = {
  turnId: string;
  status: string;
  failureCode?: string;
  sideEffect?: string;
  confirmationId?: string;
};

const SUCCESSFUL_TURN_STATUSES = new Set(['assistant_saved', 'clarification_saved']);
const TERMINAL_TURN_STATUSES = new Set([
  ...SUCCESSFUL_TURN_STATUSES,
  'degraded_saved',
  'failed_retryable',
  'failed_final',
  'cancelled',
]);
const AUTHORIZATION_FAILURE = /unauthor|forbidden|outside_scope|cross[_-]?tenant|scope_mismatch/i;
const UNAUTHORIZED_EVIDENCE = /unauthorized_evidence|wrong_document_scope|cross[_-]?tenant/i;
const MISSING_DOCUMENT_EVIDENCE = /required_evidence_(?:missing|receipt_missing)|zero_document/i;
const FALSE_ACTION_CLAIM = /false_(?:web_tool|document_tool|material_action)_claim|accepted_action_not_executed/i;

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function parseObject(value?: string) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function parseTransitions(value?: string) {
  if (!value) return [] as Array<Record<string, unknown>>;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      : [];
  } catch {
    return [];
  }
}

function hasResumeTransition(turn: OperationalTurn) {
  return parseTransitions(turn.taskTransitionsJson).some((transition) =>
    transition.to === 'open' && ['suspended', 'waiting_user', 'waiting_tool'].includes(String(transition.from)));
}

function isClarification(turn: OperationalTurn) {
  return turn.outcomeType === 'clarified' || turn.status === 'clarification_saved';
}

function isSuccessful(turn: OperationalTurn) {
  return SUCCESSFUL_TURN_STATUSES.has(turn.status);
}

function isTerminal(turn: OperationalTurn) {
  return TERMINAL_TURN_STATUSES.has(turn.status);
}

function countDuplicateGroups<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts.values()].filter((count) => count > 1).length;
}

/**
 * Derive release-gating metrics from receipt-backed records. This function is
 * intentionally pure so the exact dashboard definitions remain contract-tested.
 */
export function deriveExecutiveChatMetrics(args: {
  contexts: OperationalTurnContext[];
  publications: OperationalPublication[];
  attempts: OperationalAttempt[];
  toolReceipts: OperationalToolReceipt[];
}) {
  const terminalContexts = args.contexts.filter(({ turn }) => isTerminal(turn));
  const successfulContexts = terminalContexts.filter(({ turn }) => isSuccessful(turn));
  const successfulTurnIds = new Set(successfulContexts.map(({ turn }) => turn.id));
  const directAnswers = successfulContexts.filter(({ turn }) => turn.outcomeType === 'answered').length;
  const clarifications = successfulContexts.filter(({ turn }) => isClarification(turn)).length;

  const byConversation = new Map<string, OperationalTurnContext[]>();
  for (const context of args.contexts) {
    const rows = byConversation.get(context.turn.conversationId) ?? [];
    rows.push(context);
    byConversation.set(context.turn.conversationId, rows);
  }
  let clarificationFollowups = 0;
  let resolvedClarifications = 0;
  for (const rows of byConversation.values()) {
    rows.sort((a, b) => a.turn.createdAt - b.turn.createdAt);
    rows.forEach((context, index) => {
      if (!isClarification(context.turn)) return;
      const followup = rows[index + 1];
      if (!followup || !isTerminal(followup.turn)) return;
      clarificationFollowups += 1;
      if (isSuccessful(followup.turn) && !isClarification(followup.turn)) resolvedClarifications += 1;
    });
  }

  const topicSwitches = terminalContexts.filter(({ speechAct }) => speechAct === 'switch_topic');
  const successfulTopicSwitches = topicSwitches.filter(({ turn }) => isSuccessful(turn)).length;
  const resumeTurns = terminalContexts.filter(({ turn, requestedOperation }) =>
    requestedOperation === 'resume_background_task' || hasResumeTransition(turn));
  const successfulResumeTurns = resumeTurns.filter(({ turn }) => isSuccessful(turn)).length;

  const documentActivations = terminalContexts.filter(({ documentActivationJson }) =>
    parseObject(documentActivationJson)?.active === true);
  const falseDocumentActivations = documentActivations.filter(({ speechAct, requestedOperation, documentActivationJson }) => {
    const activation = parseObject(documentActivationJson);
    return speechAct === 'social' || speechAct === 'switch_topic' || speechAct === 'unknown' ||
      requestedOperation === 'await_upload' || activation?.source === 'none';
  }).length;
  const qaProductionIsolationViolations = terminalContexts.filter((context) =>
    context.conversationProvenance === 'production' &&
    context.selectedDocumentProvenances.some((provenance) => provenance !== 'production')).length;

  const unauthorizedResourceRejections = args.toolReceipts.filter((receipt) =>
    receipt.status === 'rejected' && AUTHORIZATION_FAILURE.test(receipt.failureCode ?? '')).length;
  const successfulToolCalls = args.toolReceipts.filter((receipt) =>
    receipt.status === 'completed' && successfulTurnIds.has(receipt.turnId)).length;
  const rejectedPublications = args.publications.filter((publication) => publication.decision === 'rejected').length;
  const publicationCodes = (publication: OperationalPublication) => [
    ...publication.rejectionCodes,
    ...(publication.shadowRejectionCodes ?? []),
  ];
  const publishedOutcomeViolations = args.publications.filter((publication) =>
    publication.decision !== 'rejected' && publicationCodes(publication).length > 0);
  const unauthorizedEvidencePublications = publishedOutcomeViolations.filter((publication) =>
    publicationCodes(publication).some((code) => UNAUTHORIZED_EVIDENCE.test(code))).length;
  const zeroDocumentAnalysisPublications = publishedOutcomeViolations.filter((publication) =>
    publicationCodes(publication).some((code) => MISSING_DOCUMENT_EVIDENCE.test(code))).length;
  const falseToolOrActionClaimPublications = publishedOutcomeViolations.filter((publication) =>
    publicationCodes(publication).some((code) => FALSE_ACTION_CLAIM.test(code))).length;
  const materialSideEffectsWithoutConfirmation = args.toolReceipts.filter((receipt) =>
    receipt.status === 'completed' && receipt.sideEffect === 'material' && !receipt.confirmationId).length;

  const interruptionTurnIds = new Set(args.attempts
    .filter((attempt) => Boolean(attempt.incompleteReason) || attempt.status === 'failed')
    .map((attempt) => attempt.turnId));
  const recoveredInterruptionTurnIds = new Set(args.attempts
    .filter((attempt) => interruptionTurnIds.has(attempt.turnId) && attempt.status === 'completed' &&
      (attempt.strategy === 'continue' || attempt.attemptNumber > 1))
    .map((attempt) => attempt.turnId));

  const published = args.publications.filter((publication) => publication.decision !== 'rejected');
  const taskIdempotencyViolations = countDuplicateGroups(
    terminalContexts.map(({ turn }) => turn),
    (turn) => `${turn.conversationId}:${turn.requestId}`,
  );
  const publicationIdempotencyViolations = countDuplicateGroups(published, (publication) => publication.turnId) +
    countDuplicateGroups(published, (publication) => publication.envelopeId);
  const successfulCostMicrousd = args.attempts
    .filter((attempt) => attempt.status === 'completed' && successfulTurnIds.has(attempt.turnId))
    .reduce((sum, attempt) => sum + (attempt.estimatedCostMicrousd ?? 0), 0);

  const realProductionTurns = terminalContexts.filter((context) => context.conversationProvenance === 'production').length;
  const syntheticQaTurns = terminalContexts.length - realProductionTurns;

  return {
    successfulTurns: successfulContexts.length,
    failedTurns: terminalContexts.length - successfulContexts.length,
    directAnswers,
    directAnswerRate: rate(directAnswers, successfulContexts.length),
    clarifications,
    clarificationRate: rate(clarifications, successfulContexts.length),
    clarificationFollowups,
    resolvedClarifications,
    clarificationResolutionRate: rate(resolvedClarifications, clarificationFollowups),
    topicSwitches: topicSwitches.length,
    successfulTopicSwitches,
    topicSwitchSuccessRate: rate(successfulTopicSwitches, topicSwitches.length),
    backgroundTaskResumes: resumeTurns.length,
    successfulBackgroundTaskResumes: successfulResumeTurns,
    backgroundTaskResumeSuccessRate: rate(successfulResumeTurns, resumeTurns.length),
    documentActivations: documentActivations.length,
    falseDocumentActivations,
    documentActivationPrecision: documentActivations.length > 0
      ? 1 - rate(falseDocumentActivations, documentActivations.length)
      : 1,
    documentActivationFalsePositiveRate: rate(falseDocumentActivations, terminalContexts.length),
    unauthorizedResourceRejections,
    toolCallsPerSuccessfulTurn: rate(successfulToolCalls, successfulContexts.length),
    outcomeValidationFailures: rejectedPublications,
    outcomeValidationFailureRate: rate(rejectedPublications, args.publications.length),
    publishedOutcomeViolations: publishedOutcomeViolations.length,
    unauthorizedEvidencePublications,
    zeroDocumentAnalysisPublications,
    falseToolOrActionClaimPublications,
    materialSideEffectsWithoutConfirmation,
    streamInterruptions: interruptionTurnIds.size,
    recoveredStreamInterruptions: recoveredInterruptionTurnIds.size,
    streamRecoveryRate: rate(recoveredInterruptionTurnIds.size, interruptionTurnIds.size),
    taskIdempotencyViolations,
    publicationIdempotencyViolations,
    qaProductionIsolationViolations,
    realProductionTurns,
    syntheticQaTurns,
    successfulOutcomeCostUsd: Number((successfulCostMicrousd / 1_000_000).toFixed(6)),
    costPerSuccessfulOutcomeUsd: successfulContexts.length > 0
      ? Number((successfulCostMicrousd / 1_000_000 / successfulContexts.length).toFixed(6))
      : 0,
  };
}
