export const EXECUTIVE_CHAT_ROLLOUT_FEATURES = [
  'foreground_intent_v2',
  'document_activation_v2',
  'publication_v2',
  'self_correction_v1',
  'qa_provenance_v1',
  'understanding_resume_v2',
  'conversation_kernel_v2',
  'context_builder_v2',
  'task_ledger_v2',
  'tool_broker_v2',
  'outcome_verifier_v2',
  'model_policy_v2',
  'luna_user_facing',
  'sol_escalation',
  'route_mode_diagnostic_only_v2',
  'actual_usage_required',
] as const;

export type ExecutiveChatRolloutFeature = typeof EXECUTIVE_CHAT_ROLLOUT_FEATURES[number];
export type ExecutiveChatRolloutMode = 'off' | 'shadow' | 'enforce';

const PHASE_2_FEATURES = new Set<ExecutiveChatRolloutFeature>([
  'conversation_kernel_v2', 'context_builder_v2', 'task_ledger_v2', 'tool_broker_v2',
  'outcome_verifier_v2', 'model_policy_v2', 'luna_user_facing', 'sol_escalation',
  'route_mode_diagnostic_only_v2',
]);

export function compatibleRolloutMode(
  feature: ExecutiveChatRolloutFeature,
  value: unknown,
): ExecutiveChatRolloutMode {
  if (value === 'off' || value === 'shadow' || value === 'enforce') return value;
  if (feature === 'actual_usage_required') return 'enforce';
  return PHASE_2_FEATURES.has(feature) ? 'shadow' : 'off';
}

export type ExecutiveChatRolloutConfigSnapshot = {
  version: number;
  environment: 'preview' | 'production';
  featureModes: Record<ExecutiveChatRolloutFeature, ExecutiveChatRolloutMode>;
  defaultMode: ExecutiveChatRolloutMode;
  cohortPercentage: number;
  allowlistedUserIds: string[];
  allowlistedOrgIds: string[];
  allowlistedCaseIds: string[];
  allowlistedConversationIds: string[];
  denylistedUserIds: string[];
  denylistedOrgIds: string[];
  denylistedCaseIds: string[];
  denylistedConversationIds: string[];
  cohortSalt: string;
  activationStartsAt: number;
  expiresAt?: number;
  emergencyDisabled: boolean;
};

export type ExecutiveChatRolloutSubject = {
  userId: string;
  orgId?: string;
  caseId?: string;
  conversationId?: string;
  qaSynthetic?: boolean;
};

export type ExecutiveChatRolloutDecision = {
  configVersion: number;
  modes: Record<ExecutiveChatRolloutFeature, ExecutiveChatRolloutMode>;
  selected: boolean;
  selectionReason: 'emergency_off' | 'denylist' | 'allowlist' | 'cohort' | 'default';
  cohortBucket: number;
};

const OFF_MODES = Object.fromEntries(
  EXECUTIVE_CHAT_ROLLOUT_FEATURES.map((feature) => [feature, 'off']),
) as Record<ExecutiveChatRolloutFeature, ExecutiveChatRolloutMode>;

function matches(values: string[], candidate?: string) {
  return Boolean(candidate && values.includes(candidate));
}

export function stableRolloutBucket(key: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 10_000;
}

export function resolveExecutiveChatRollout(args: {
  config: ExecutiveChatRolloutConfigSnapshot;
  subject: ExecutiveChatRolloutSubject;
  now: number;
  globalEmergencyOff?: boolean;
}): ExecutiveChatRolloutDecision {
  const { config, subject } = args;
  const cohortBucket = stableRolloutBucket(`${subject.userId}:${config.cohortSalt}`);
  const inactive = args.now < config.activationStartsAt ||
    (config.expiresAt !== undefined && args.now >= config.expiresAt);
  if (args.globalEmergencyOff || config.emergencyDisabled || inactive) {
    return { configVersion: config.version, modes: { ...OFF_MODES }, selected: false, selectionReason: 'emergency_off', cohortBucket };
  }

  const denied = matches(config.denylistedUserIds, subject.userId) ||
    matches(config.denylistedOrgIds, subject.orgId) ||
    matches(config.denylistedCaseIds, subject.caseId) ||
    matches(config.denylistedConversationIds, subject.conversationId);
  if (denied) {
    return { configVersion: config.version, modes: { ...OFF_MODES }, selected: false, selectionReason: 'denylist', cohortBucket };
  }

  const allowed = matches(config.allowlistedUserIds, subject.userId) ||
    matches(config.allowlistedOrgIds, subject.orgId) ||
    matches(config.allowlistedCaseIds, subject.caseId) ||
    matches(config.allowlistedConversationIds, subject.conversationId);
  const cohortSelected = cohortBucket < Math.round(Math.max(0, Math.min(100, config.cohortPercentage)) * 100);
  if (allowed || cohortSelected) {
    return {
      configVersion: config.version,
      modes: { ...config.featureModes },
      selected: true,
      selectionReason: allowed ? 'allowlist' : 'cohort',
      cohortBucket,
    };
  }

  return {
    configVersion: config.version,
    modes: Object.fromEntries(EXECUTIVE_CHAT_ROLLOUT_FEATURES.map((feature) => [feature, config.defaultMode])) as Record<ExecutiveChatRolloutFeature, ExecutiveChatRolloutMode>,
    selected: false,
    selectionReason: 'default',
    cohortBucket,
  };
}

export function rolloutModeEnforced(decision: ExecutiveChatRolloutDecision | undefined, feature: ExecutiveChatRolloutFeature) {
  return decision?.modes[feature] === 'enforce';
}
