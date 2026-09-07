import { OUTCOME_VERIFIER_VERSION, type KernelDecision, type ToolCallReceipt } from '../conversation/contracts';

const KNOWN_IRRELEVANT_FALLBACKS = [
  /cannot verify a complete answer from the order language available for this turn/i,
  /order language available for this turn/i,
  /safest practical next step based on the information available/i,
];
const WEB_TOOL_CLAIM = /\b(?:i|we)\s+(?:searched|looked up|checked)\s+(?:the\s+)?(?:web|internet|current law|official sources?)\b/i;
const DOCUMENT_TOOL_CLAIM = /\b(?:i|we)\s+(?:reviewed|read|checked|opened|retrieved)\s+(?:the|your|this|attached|saved)\s+(?:document|file|order|attachment|pdf)\b/i;
const MATERIAL_ACTION_CLAIM = /\b(?:i|we)\s+(?:filed|submitted|sent|scheduled|deleted|updated)\b/i;

export type OutcomeVerificationInput = {
  latestUserGoal: string;
  decision: KernelDecision;
  toolReceipts: ToolCallReceipt[];
  requiredEvidence: boolean;
  evidenceIds: string[];
  authorizedEvidenceIds: ReadonlySet<string>;
};

export function verifyConversationOutcome(input: OutcomeVerificationInput) {
  const rejectionCodes: string[] = [];
  const visibleText = input.decision.kind === 'answer'
    ? input.decision.answer
    : input.decision.kind === 'clarify'
      ? input.decision.question
      : input.decision.kind === 'limited'
        ? input.decision.message
        : '';

  if (visibleText.trim().length === 0 && input.decision.kind !== 'tool_call' && input.decision.kind !== 'escalate') {
    rejectionCodes.push('empty_visible_outcome');
  }
  if (KNOWN_IRRELEVANT_FALLBACKS.some((pattern) => pattern.test(visibleText))) {
    rejectionCodes.push('known_irrelevant_fallback');
  }
  if (input.evidenceIds.some((id) => !input.authorizedEvidenceIds.has(id))) {
    rejectionCodes.push('unauthorized_evidence');
  }
  if (input.requiredEvidence && input.evidenceIds.length === 0 && input.decision.kind === 'answer') {
    rejectionCodes.push('required_evidence_missing');
  }
  const completedTools = input.toolReceipts.filter((receipt) => receipt.status === 'completed');
  if (
    input.requiredEvidence &&
    input.decision.kind === 'answer' &&
    !completedTools.some((receipt) => receipt.toolName === 'read_document_pages' && receipt.evidenceIds.some((id) => input.evidenceIds.includes(id)))
  ) {
    rejectionCodes.push('required_evidence_receipt_missing');
  }
  if (WEB_TOOL_CLAIM.test(visibleText) && !completedTools.some((receipt) => ['search_current_authority', 'verify_current_law', 'lookup_local_procedure'].includes(receipt.toolName))) {
    rejectionCodes.push('false_web_tool_claim');
  }
  if (DOCUMENT_TOOL_CLAIM.test(visibleText) && !completedTools.some((receipt) => receipt.toolName === 'read_document_pages')) {
    rejectionCodes.push('false_document_tool_claim');
  }
  if (MATERIAL_ACTION_CLAIM.test(visibleText) && !completedTools.some((receipt) => receipt.sideEffect !== 'none')) {
    rejectionCodes.push('false_material_action_claim');
  }
  if (input.toolReceipts.some((receipt) => receipt.status === 'completed' && receipt.authorizationScopeHash.length === 0)) {
    rejectionCodes.push('tool_receipt_scope_missing');
  }

  return {
    passed: rejectionCodes.length === 0,
    verifierVersion: OUTCOME_VERIFIER_VERSION,
    rejectionCodes,
    requiresSemanticReview: rejectionCodes.length === 0 && visibleText.length > 0 && input.latestUserGoal.trim().length > 0,
  };
}
