import { EXECUTIVE_CHAT_ROLLOUT_FEATURES, type ExecutiveChatRolloutDecision, type ExecutiveChatRolloutMode } from './rollout';

export type ExecutiveChatFeatureFlags = {
  shadowUnderstanding: boolean;
  controlState: boolean;
  capabilityLedger: boolean;
  publicationGate: boolean;
  repairPolicy: boolean;
  semanticArbiter: boolean;
  documentActivationV2: boolean;
  publicationGateV2: boolean;
  selfCorrectionV2: boolean;
  understandingResumeV2: boolean;
};

function enabled(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase());
}

/**
 * Centralized rollout contract. Safety boundaries default on; the optional model
 * arbiter defaults off until its shadow disagreement/cost sample is accepted.
 */
export function getExecutiveChatFeatureFlags(
  env: Record<string, string | undefined> = process.env,
): ExecutiveChatFeatureFlags {
  return {
    shadowUnderstanding: enabled(env.EXEC_CHAT_SHADOW_UNDERSTANDING, true),
    controlState: enabled(env.EXEC_CHAT_CONTROL_STATE, true),
    capabilityLedger: enabled(env.EXEC_CHAT_CAPABILITY_LEDGER, true),
    publicationGate: enabled(env.EXEC_CHAT_PUBLICATION_GATE, true),
    repairPolicy: enabled(env.EXEC_CHAT_REPAIR_POLICY, true),
    semanticArbiter: enabled(env.EXEC_CHAT_SEMANTIC_ARBITER, false),
    documentActivationV2: enabled(env.EXEC_CHAT_DOCUMENT_ACTIVATION_V2, false),
    publicationGateV2: enabled(env.EXEC_CHAT_PUBLICATION_V2, false),
    selfCorrectionV2: enabled(env.EXEC_CHAT_SELF_CORRECTION_V2, false),
    understandingResumeV2: enabled(env.EXEC_CHAT_UNDERSTANDING_RESUME_V2, true),
  };
}

function explicitlyDisabled(value: string | undefined) {
  return value !== undefined && !enabled(value, true);
}

/** Convert a persisted, server-selected rollout decision into runtime behavior. */
export function featureFlagsForRollout(
  decision: ExecutiveChatRolloutDecision | undefined,
  env: Record<string, string | undefined> = process.env,
): ExecutiveChatFeatureFlags {
  const base = getExecutiveChatFeatureFlags(env);
  if (!decision) return base;
  const emergencyOff = explicitlyDisabled(env.EXEC_CHAT_GLOBAL) || enabled(env.EXEC_CHAT_EMERGENCY_OFF, false);
  const enforce = (feature: keyof ExecutiveChatRolloutDecision['modes']) =>
    !emergencyOff && decision.modes[feature] === 'enforce';
  const documentActivationV2 = enforce('foreground_intent_v2') &&
    enforce('document_activation_v2') &&
    !explicitlyDisabled(env.EXEC_CHAT_DOCUMENT_ACTIVATION_V2);
  return {
    ...base,
    documentActivationV2,
    publicationGateV2: enforce('publication_v2') && !explicitlyDisabled(env.EXEC_CHAT_PUBLICATION_V2),
    selfCorrectionV2: enforce('self_correction_v1') && !explicitlyDisabled(env.EXEC_CHAT_SELF_CORRECTION_V2),
    understandingResumeV2: enforce('understanding_resume_v2') && !explicitlyDisabled(env.EXEC_CHAT_UNDERSTANDING_RESUME_V2),
  };
}

export function featureFlagsForPersistedRollout(
  persisted: { rolloutConfigVersion?: number; rolloutModesJson?: string; rolloutSelectionReason?: string },
  env: Record<string, string | undefined> = process.env,
) {
  if (!persisted.rolloutModesJson) return getExecutiveChatFeatureFlags(env);
  try {
    const modes = JSON.parse(persisted.rolloutModesJson) as Record<string, ExecutiveChatRolloutMode>;
    if (!EXECUTIVE_CHAT_ROLLOUT_FEATURES.every((feature) => ['off', 'shadow', 'enforce'].includes(modes[feature]))) {
      return getExecutiveChatFeatureFlags(env);
    }
    return featureFlagsForRollout({
      configVersion: persisted.rolloutConfigVersion ?? 0,
      modes: modes as ExecutiveChatRolloutDecision['modes'],
      selected: persisted.rolloutSelectionReason === 'allowlist' || persisted.rolloutSelectionReason === 'cohort',
      selectionReason: (persisted.rolloutSelectionReason ?? 'default') as ExecutiveChatRolloutDecision['selectionReason'],
      cohortBucket: 0,
    }, env);
  } catch {
    return getExecutiveChatFeatureFlags(env);
  }
}

