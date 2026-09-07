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
  conversationKernelMode: ExecutiveChatRolloutMode;
  contextBuilderMode: ExecutiveChatRolloutMode;
  taskLedgerMode: ExecutiveChatRolloutMode;
  toolBrokerMode: ExecutiveChatRolloutMode;
  outcomeVerifierMode: ExecutiveChatRolloutMode;
  modelPolicyMode: ExecutiveChatRolloutMode;
  lunaUserFacing: boolean;
  solEscalation: boolean;
  routeModeDiagnosticOnly: boolean;
  actualUsageRequired: boolean;
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
    conversationKernelMode: enabled(env.EXEC_CHAT_KERNEL_V2, false) ? 'enforce' : 'shadow',
    contextBuilderMode: enabled(env.EXEC_CHAT_CONTEXT_BUILDER_V2, false) ? 'enforce' : 'shadow',
    taskLedgerMode: enabled(env.EXEC_CHAT_TASK_LEDGER_V2, false) ? 'enforce' : 'shadow',
    toolBrokerMode: enabled(env.EXEC_CHAT_TOOL_BROKER_V2, false) ? 'enforce' : 'shadow',
    outcomeVerifierMode: enabled(env.EXEC_CHAT_OUTCOME_VERIFIER_V2, false) ? 'enforce' : 'shadow',
    modelPolicyMode: enabled(env.EXEC_CHAT_MODEL_POLICY_V2, false) ? 'enforce' : 'shadow',
    lunaUserFacing: enabled(env.EXEC_CHAT_LUNA_USER_FACING, false),
    solEscalation: enabled(env.EXEC_CHAT_SOL_ESCALATION, false),
    routeModeDiagnosticOnly: enabled(env.EXEC_CHAT_ROUTE_MODE_DIAGNOSTIC_ONLY, false),
    actualUsageRequired: enabled(env.EXEC_CHAT_ACTUAL_USAGE_REQUIRED, true),
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
    semanticArbiter: documentActivationV2 && !explicitlyDisabled(env.EXEC_CHAT_SEMANTIC_ARBITER),
    documentActivationV2,
    publicationGateV2: enforce('publication_v2') && !explicitlyDisabled(env.EXEC_CHAT_PUBLICATION_V2),
    selfCorrectionV2: enforce('self_correction_v1') && !explicitlyDisabled(env.EXEC_CHAT_SELF_CORRECTION_V2),
    understandingResumeV2: enforce('understanding_resume_v2') && !explicitlyDisabled(env.EXEC_CHAT_UNDERSTANDING_RESUME_V2),
    conversationKernelMode: emergencyOff ? 'off' : decision.modes.conversation_kernel_v2,
    contextBuilderMode: emergencyOff ? 'off' : decision.modes.context_builder_v2,
    taskLedgerMode: emergencyOff ? 'off' : decision.modes.task_ledger_v2,
    toolBrokerMode: emergencyOff ? 'off' : decision.modes.tool_broker_v2,
    outcomeVerifierMode: emergencyOff ? 'off' : decision.modes.outcome_verifier_v2,
    modelPolicyMode: emergencyOff ? 'off' : decision.modes.model_policy_v2,
    lunaUserFacing: enforce('luna_user_facing'),
    solEscalation: enforce('sol_escalation'),
    routeModeDiagnosticOnly: enforce('route_mode_diagnostic_only_v2'),
    actualUsageRequired: enforce('actual_usage_required'),
  };
}

export function featureFlagsForPersistedRollout(
  persisted: { rolloutConfigVersion?: number; rolloutModesJson?: string; rolloutSelectionReason?: string },
  env: Record<string, string | undefined> = process.env,
) {
  if (!persisted.rolloutModesJson) return getExecutiveChatFeatureFlags(env);
  try {
    const parsed = JSON.parse(persisted.rolloutModesJson) as Record<string, ExecutiveChatRolloutMode>;
    const modes = Object.fromEntries(EXECUTIVE_CHAT_ROLLOUT_FEATURES.map((feature) => [
      feature,
      parsed[feature] === 'off' || parsed[feature] === 'shadow' || parsed[feature] === 'enforce'
        ? parsed[feature]
        : feature === 'actual_usage_required'
          ? 'enforce'
          : feature.endsWith('_v2') || feature === 'luna_user_facing' || feature === 'sol_escalation'
            ? 'shadow'
            : 'off',
    ])) as ExecutiveChatRolloutDecision['modes'];
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

