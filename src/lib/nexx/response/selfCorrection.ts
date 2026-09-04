export const SELF_CORRECTION_MAX_ACTIONS = 2;
export const SELF_CORRECTION_MAX_ATTEMPTS = 2;

export type SelfCorrectionAction =
  | 'recompute_intent'
  | 'clear_stale_activation'
  | 'reset_stale_pending_action'
  | 'resolve_reference'
  | 'refresh_capabilities'
  | 'retry_failed_step'
  | 'regenerate'
  | 'ask_clarification';

export type SelfCorrectionContradiction =
  | 'prior_social_document_activation'
  | 'prior_false_unreadable_claim'
  | 'prior_publication_rejected'
  | 'prior_failed_step_retryable'
  | 'stale_pending_action'
  | 'material_reference_ambiguity'
  | 'user_challenged_prior_answer'
  | 'repeated_response_fingerprint';

export type PriorTurnInspectionReceipt = {
  receiptVersion: 1;
  receiptId: string;
  targetMessageId: string;
  targetTurnId: string;
  inspectedAt: number;
  responseFingerprint: string;
  foreground: {
    speechAct?: string;
    routeMode?: string;
    selectedDocumentIds: string[];
    documentActivationActive: boolean;
  };
  capability: {
    snapshotHash?: string;
    readableDocumentCount: number;
  };
  publication: {
    decision?: string;
    rejectionCodes: string[];
    validatorVersion?: string;
  };
  operation: {
    status?: string;
    errorCode?: string;
    retryable: boolean;
  };
};

export type SelfCorrectionPlan = {
  actions: SelfCorrectionAction[];
  contradictionCodes: SelfCorrectionContradiction[];
  maxActions: typeof SELF_CORRECTION_MAX_ACTIONS;
  exhausted: boolean;
  terminalReason?: 'loop_detected' | 'repair_budget_exhausted' | 'manual_review_required';
};

const UNREADABLE_CLAIM = /\b(?:cannot|can't|do not|don't|unable to)\b.{0,100}\b(?:read|access|see|open|search)\b.{0,100}\b(?:order|document|file|pdf|text|pages?)\b|\bdo not have\b.{0,80}\breadable\b/i;

export function classifySelfCorrectionContradictions(args: {
  currentSpeechAct?: string;
  priorResponse: string;
  receipt: PriorTurnInspectionReceipt;
  ambiguityMaterial?: boolean;
  stalePendingAction?: boolean;
  repeatedFingerprint?: boolean;
}): SelfCorrectionContradiction[] {
  const contradictions: SelfCorrectionContradiction[] = [];
  if (['challenge', 'correct', 'reassess'].includes(args.currentSpeechAct ?? '')) {
    contradictions.push('user_challenged_prior_answer');
  }
  if (
    args.receipt.foreground.speechAct === 'social' &&
    (args.receipt.foreground.documentActivationActive || args.receipt.foreground.selectedDocumentIds.length > 0)
  ) {
    contradictions.push('prior_social_document_activation');
  }
  if (UNREADABLE_CLAIM.test(args.priorResponse) && args.receipt.capability.readableDocumentCount > 0) {
    contradictions.push('prior_false_unreadable_claim');
  }
  if (args.receipt.publication.decision === 'rejected' || args.receipt.publication.rejectionCodes.length > 0) {
    contradictions.push('prior_publication_rejected');
  }
  if (args.receipt.operation.retryable && args.receipt.operation.errorCode) {
    contradictions.push('prior_failed_step_retryable');
  }
  if (args.stalePendingAction) contradictions.push('stale_pending_action');
  if (args.ambiguityMaterial) contradictions.push('material_reference_ambiguity');
  if (args.repeatedFingerprint) contradictions.push('repeated_response_fingerprint');
  return Array.from(new Set(contradictions));
}

export function planSelfCorrection(args: {
  contradictionCodes: SelfCorrectionContradiction[];
  priorAutomaticAttemptCount?: number;
}): SelfCorrectionPlan {
  const priorAutomaticAttemptCount = Math.max(0, args.priorAutomaticAttemptCount ?? 0);
  if (args.contradictionCodes.includes('repeated_response_fingerprint')) {
    return {
      actions: [],
      contradictionCodes: args.contradictionCodes,
      maxActions: SELF_CORRECTION_MAX_ACTIONS,
      exhausted: true,
      terminalReason: 'loop_detected',
    };
  }
  if (priorAutomaticAttemptCount >= SELF_CORRECTION_MAX_ATTEMPTS) {
    return {
      actions: [],
      contradictionCodes: args.contradictionCodes,
      maxActions: SELF_CORRECTION_MAX_ACTIONS,
      exhausted: true,
      terminalReason: 'repair_budget_exhausted',
    };
  }

  const actions: SelfCorrectionAction[] = [];
  const add = (action: SelfCorrectionAction) => {
    if (!actions.includes(action) && actions.length < SELF_CORRECTION_MAX_ACTIONS) actions.push(action);
  };
  if (args.contradictionCodes.includes('prior_social_document_activation')) add('clear_stale_activation');
  if (args.contradictionCodes.includes('stale_pending_action')) add('reset_stale_pending_action');
  if (args.contradictionCodes.includes('prior_false_unreadable_claim')) add('refresh_capabilities');
  if (args.contradictionCodes.includes('prior_failed_step_retryable')) add('retry_failed_step');
  if (args.contradictionCodes.includes('material_reference_ambiguity')) add('resolve_reference');
  if (args.contradictionCodes.includes('prior_publication_rejected')) add('recompute_intent');
  if (actions.length < SELF_CORRECTION_MAX_ACTIONS) {
    add(args.contradictionCodes.includes('material_reference_ambiguity') ? 'ask_clarification' : 'regenerate');
  }

  return {
    actions,
    contradictionCodes: args.contradictionCodes,
    maxActions: SELF_CORRECTION_MAX_ACTIONS,
    exhausted: actions.length === 0,
    terminalReason: actions.length === 0 ? 'manual_review_required' : undefined,
  };
}

export function correctionInspectionPrompt(
  receipt: PriorTurnInspectionReceipt,
  plan: SelfCorrectionPlan,
) {
  const findings = plan.contradictionCodes.flatMap((code) => {
    if (code === 'prior_social_document_activation') {
      return ['The prior turn was social, but document work was activated when it should have remained background context.'];
    }
    if (code === 'prior_false_unreadable_claim') {
      return [`The prior response said the document was unreadable, but the recorded capability snapshot shows ${receipt.capability.readableDocumentCount} readable document(s).`];
    }
    if (code === 'prior_publication_rejected') {
      return ['The earlier candidate response failed publication validation.'];
    }
    if (code === 'prior_failed_step_retryable') {
      return ['The earlier operation has a retryable failure record.'];
    }
    if (code === 'stale_pending_action') return ['A stale pending action was found and must not control this turn.'];
    if (code === 'material_reference_ambiguity') return ['The requested referent remains materially ambiguous.'];
    return [];
  });
  return [
    `A server-side inspection receipt was issued for the challenged response (${receipt.receiptId}).`,
    `Inspection findings: ${findings.join(' ') || 'The prior response and its recorded execution facts were inspected; no specific contradiction was confirmed.'}`,
    `Authorized repair actions: ${plan.actions.join(', ') || 'none'}.`,
    'Base any acknowledgment on those findings. Do not claim to have inspected, retried, refreshed, or repaired anything not recorded above.',
    'Do not expose receipt IDs, internal reason codes, hidden reasoning, or raw diagnostic payloads to the user.',
  ].join('\n');
}

export function selfCorrectionTerminalMessage(plan: SelfCorrectionPlan) {
  if (plan.terminalReason === 'loop_detected') {
    return 'I checked the last response, but the same correction path has already been attempted. I will not repeat it without new direction. Which specific statement should I verify next?';
  }
  if (plan.terminalReason === 'repair_budget_exhausted') {
    return 'I checked the prior response, but the automatic correction limit has been reached. Which specific statement should I verify next so I can proceed without repeating the same failed path?';
  }
  return 'I checked the prior response, but I cannot safely correct it automatically from the current record. Which specific statement should I verify next?';
}
