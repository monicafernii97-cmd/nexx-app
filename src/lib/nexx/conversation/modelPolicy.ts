import {
  ECONOMY_MODEL,
  LEGACY_PRIMARY_MODEL,
  PRIMARY_MODEL,
  PRO_MODEL,
  type SubscriptionTier,
} from '../../tiers';
import type {
  EscalationReasonCode,
  EscalationRequest,
  NexxModel,
  ReasoningEffort,
} from './contracts';

export type ModelRiskSignals = {
  lowRiskConversation?: boolean;
  personalizedLegalInterpretation?: boolean;
  documentGroundedConclusion?: boolean;
  jurisdictionDependentProcedure?: boolean;
  deadlineCalculation?: boolean;
  courtReadyDraft?: boolean;
  currentSafetyRisk?: boolean;
  challengedSubstantiveAnswer?: boolean;
  conflictingEvidence?: boolean;
  highImpactSideEffect?: boolean;
  exceptionalComplexity?: boolean;
};

export type ModelPolicyDecision = {
  initialModel: NexxModel;
  minimumModel: NexxModel;
  reasoningEffort: ReasoningEffort;
  allowedEscalations: NexxModel[];
  reasonCodes: string[];
};

const TERRA_MINIMUM_SIGNALS: Array<keyof ModelRiskSignals> = [
  'personalizedLegalInterpretation',
  'documentGroundedConclusion',
  'jurisdictionDependentProcedure',
  'deadlineCalculation',
  'courtReadyDraft',
  'currentSafetyRisk',
  'challengedSubstantiveAnswer',
  'conflictingEvidence',
  'highImpactSideEffect',
];

export function resolveModelPolicy(args: {
  tier: SubscriptionTier;
  signals: ModelRiskSignals;
}): ModelPolicyDecision {
  const reasonCodes = TERRA_MINIMUM_SIGNALS.filter((signal) => Boolean(args.signals[signal]));
  const terraRequired = reasonCodes.length > 0 || !args.signals.lowRiskConversation;
  const solEligible = Boolean(args.signals.conflictingEvidence || args.signals.exceptionalComplexity || args.signals.highImpactSideEffect) &&
    ['premium', 'executive'].includes(args.tier);

  return {
    initialModel: terraRequired ? PRIMARY_MODEL : ECONOMY_MODEL,
    minimumModel: terraRequired ? PRIMARY_MODEL : ECONOMY_MODEL,
    reasoningEffort: solEligible
      ? 'high'
      : terraRequired
        ? 'medium'
        : 'low',
    allowedEscalations: terraRequired
      ? solEligible ? [PRO_MODEL] : []
      : solEligible ? [PRIMARY_MODEL, PRO_MODEL] : [PRIMARY_MODEL],
    reasonCodes: reasonCodes.length > 0 ? reasonCodes : ['low_risk_conversation'],
  };
}

const SOL_REASON_CODES = new Set<EscalationReasonCode>([
  'conflicting_evidence',
  'deadline_uncertainty',
  'high_impact_draft',
  'validation_failure',
  'challenged_answer',
  'complexity_limit',
]);

export function validateEscalation(args: {
  request: EscalationRequest;
  policy: ModelPolicyDecision;
  estimatedCostMicrousd: number;
}) {
  if (!args.policy.allowedEscalations.includes(args.request.requestedModel)) {
    return { allowed: false as const, code: 'model_not_eligible' };
  }
  if (args.request.requestedModel === PRO_MODEL && !SOL_REASON_CODES.has(args.request.reasonCode)) {
    return { allowed: false as const, code: 'sol_reason_not_eligible' };
  }
  if (args.request.remainingBudgetMicrousd < Math.max(0, args.estimatedCostMicrousd)) {
    return { allowed: false as const, code: 'turn_budget_exhausted' };
  }
  if (args.request.fromModel === args.request.requestedModel) {
    return { allowed: false as const, code: 'same_model_escalation' };
  }
  return { allowed: true as const, code: 'approved' };
}

export function emergencyFallbackFor(model: NexxModel): NexxModel | undefined {
  if (model === PRO_MODEL) return PRIMARY_MODEL;
  if (model === PRIMARY_MODEL) return ECONOMY_MODEL;
  if (model === ECONOMY_MODEL) return LEGACY_PRIMARY_MODEL;
  return undefined;
}
