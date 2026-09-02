import type { ClaimVerificationError } from './claimVerifier';
import type { QuestionKind } from '../orchestration/types';

export type RepairStage =
  | 'deterministic_repair'
  | 'rerender'
  | 'single_regeneration'
  | 'scoped_answer'
  | 'clarification'
  | 'safe_limitation'
  | 'stop';

export type RepairDecision = {
  stage: RepairStage;
  reasonCodes: string[];
  retryBudgetRemaining: number;
};

export function decideRepair(args: {
  errors: ClaimVerificationError[];
  attempt: number;
  hasCanonicalPlan: boolean;
  hasSupportedPropositions: boolean;
  ambiguityMaterial: boolean;
  capabilityAllowed: boolean;
}): RepairDecision {
  const remaining = Math.max(0, 2 - args.attempt);
  if (args.errors.length === 0) return { stage: 'stop', reasonCodes: ['verification_passed'], retryBudgetRemaining: remaining };
  if (args.errors.includes('RESP_INTERNAL_PAYLOAD') || args.errors.includes('RESP_GENERIC_WHEN_EVIDENCE_AVAILABLE')) {
    return { stage: 'deterministic_repair', reasonCodes: args.errors, retryBudgetRemaining: remaining };
  }
  if (args.hasCanonicalPlan && args.attempt === 0) {
    return { stage: 'rerender', reasonCodes: args.errors, retryBudgetRemaining: remaining };
  }
  if (remaining > 0 && args.capabilityAllowed && !args.ambiguityMaterial) {
    return { stage: 'single_regeneration', reasonCodes: args.errors, retryBudgetRemaining: remaining };
  }
  if (args.hasSupportedPropositions) {
    return { stage: 'scoped_answer', reasonCodes: args.errors, retryBudgetRemaining: remaining };
  }
  if (args.ambiguityMaterial || args.errors.includes('RESP_UNRESOLVED_REFERENT')) {
    return { stage: 'clarification', reasonCodes: args.errors, retryBudgetRemaining: remaining };
  }
  return { stage: 'safe_limitation', reasonCodes: args.errors, retryBudgetRemaining: remaining };
}

export function buildPublicationRepairContent(args: {
  errors: ClaimVerificationError[];
  questionKind: QuestionKind;
  supported?: string;
  limitation?: string;
  stage: RepairStage;
}) {
  if (args.errors.includes('RESP_GENERIC_WHEN_EVIDENCE_AVAILABLE') && args.questionKind === 'open_analysis') {
    return [
      'Which review would you like:',
      '',
      '- A focused review of the terms or issue you care about',
      '- A full-document review covering the entire current document',
    ].join('\n');
  }
  if (args.stage === 'clarification') {
    return 'Which part of the current request do you want me to handle? I will keep the same document and task active.';
  }
  const grounded = [args.supported, args.limitation]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n\n');
  if (grounded) return grounded;
  return 'I could not verify a complete answer from the available evidence. Your saved document and conversation remain available.';
}
