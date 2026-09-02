import type { ConversationControlSnapshot, TurnUnderstanding } from './types';

export const SEMANTIC_ARBITER_VERSION = 'semantic-arbiter-v1';

export type SemanticArbitration = {
  decision: 'retain' | 'clarify' | 'refine' | 'replace';
  confidence: number;
  selectedTaskId?: string;
  selectedDocumentIds: string[];
  reasonCodes: string[];
  version: typeof SEMANTIC_ARBITER_VERSION;
};

export type SemanticArbiterInput = {
  utterance: string;
  understanding: TurnUnderstanding;
  control?: ConversationControlSnapshot;
  candidateTaskIds: string[];
  authorizedDocumentIds: string[];
};

export function shouldInvokeSemanticArbiter(input: SemanticArbiterInput) {
  return input.understanding.ambiguityMaterial &&
    input.understanding.speechAct !== 'switch_topic' &&
    input.understanding.speechAct !== 'cancel';
}

/** Validates a classifier result against server-owned scope and fail-closed rules. */
export function validateSemanticArbitration(
  input: SemanticArbiterInput,
  candidate: Omit<SemanticArbitration, 'version'>,
): SemanticArbitration {
  const taskAllowed = !candidate.selectedTaskId || input.candidateTaskIds.includes(candidate.selectedTaskId);
  const documentsAllowed = candidate.selectedDocumentIds.every((id) => input.authorizedDocumentIds.includes(id));
  const confidence = Number.isFinite(candidate.confidence)
    ? Math.max(0, Math.min(1, candidate.confidence))
    : 0;
  if (!taskAllowed || !documentsAllowed) {
    return {
      decision: 'clarify',
      confidence: 0,
      selectedDocumentIds: [],
      reasonCodes: ['arbiter_cross_scope_rejected'],
      version: SEMANTIC_ARBITER_VERSION,
    };
  }
  if (candidate.decision === 'replace' && confidence < 0.9) {
    return {
      decision: 'retain',
      confidence,
      selectedDocumentIds: input.control?.activeDocumentIds ?? [],
      selectedTaskId: input.control?.activeTaskId,
      reasonCodes: ['arbiter_replace_below_threshold'],
      version: SEMANTIC_ARBITER_VERSION,
    };
  }
  return { ...candidate, confidence, version: SEMANTIC_ARBITER_VERSION };
}

