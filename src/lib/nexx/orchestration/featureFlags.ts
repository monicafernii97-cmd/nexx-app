export type ExecutiveChatFeatureFlags = {
  shadowUnderstanding: boolean;
  controlState: boolean;
  capabilityLedger: boolean;
  publicationGate: boolean;
  repairPolicy: boolean;
  semanticArbiter: boolean;
  documentActivationV2: boolean;
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
  };
}

