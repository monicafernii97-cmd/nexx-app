export const CONVERSATION_KERNEL_VERSION = 'conversation-kernel-v2' as const;
export const CONTEXT_BUILDER_VERSION = 'context-builder-v2' as const;
export const TASK_LEDGER_VERSION = 'task-ledger-v2' as const;
export const TOOL_POLICY_VERSION = 'tool-policy-v2' as const;
export const MODEL_POLICY_VERSION = 'model-policy-v2' as const;
export const OUTCOME_VERIFIER_VERSION = 'outcome-verifier-v2' as const;

export type NexxModel = 'gpt-5.6-luna' | 'gpt-5.6-terra' | 'gpt-5.6-sol' | 'gpt-5.4';
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

export type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  superseded?: boolean;
};

export type ReferentBinding = {
  phrase: string;
  kind: 'topic' | 'task' | 'document' | 'message' | 'result' | 'person';
  targetId: string;
  sourceMessageId: string;
  confidence: number;
};

export type BackgroundTaskStatus =
  | 'open'
  | 'waiting_user'
  | 'waiting_tool'
  | 'suspended'
  | 'completed'
  | 'cancelled';

export type BackgroundTaskDescriptor = {
  taskId: string;
  goal: string;
  status: BackgroundTaskStatus;
  resourceIds: string[];
  pendingDecisionId?: string;
  lastTouchedAt: number;
  expiresAt?: number;
};

export type PendingDecisionDescriptor = {
  decisionId: string;
  taskId: string;
  taskRevision: number;
  optionIds: string[];
  recommendedOptionId?: string;
  requiresExplicitConfirmation: boolean;
  expiresAt?: number;
};

export type AuthorizedResourceDescriptor = {
  resourceId: string;
  kind: 'document' | 'case_fact' | 'message' | 'artifact';
  label: string;
  state: 'available' | 'processing' | 'revoked' | 'quarantined' | 'superseded';
  authorizationScopeHash: string;
  metadata?: Record<string, string | number | boolean | undefined>;
};

export type AuthorizedToolDescriptor = {
  name: string;
  description: string;
  sideEffect: 'none' | 'reversible' | 'material';
  requiresConfirmation: boolean;
  authorizationScopeHash: string;
};

export type TurnBudget = {
  maxInputTokens: number;
  maxOutputTokens: number;
  maxToolCalls: number;
  maxModelAttempts: number;
  maxCostMicrousd: number;
};

export type TurnRolloutSnapshot = {
  configVersion: number;
  kernelMode: 'off' | 'shadow' | 'enforce';
  contextBuilderMode: 'off' | 'shadow' | 'enforce';
  taskLedgerMode: 'off' | 'shadow' | 'enforce';
  toolBrokerMode: 'off' | 'shadow' | 'enforce';
  outcomeVerifierMode: 'off' | 'shadow' | 'enforce';
  modelPolicyMode: 'off' | 'shadow' | 'enforce';
  routeModeAuthority: 'legacy' | 'shadow' | 'off';
};

export type ConversationTurnContext = {
  turnId: string;
  conversationId: string;
  userId: string;
  tenantId: string;
  message: string;
  recentMessages: ConversationMessage[];
  summary?: {
    text: string;
    sourceThroughMessageId: string;
    version: number;
  };
  immediateReferents: ReferentBinding[];
  tasks: BackgroundTaskDescriptor[];
  pendingDecision?: PendingDecisionDescriptor;
  resources: AuthorizedResourceDescriptor[];
  availableTools: AuthorizedToolDescriptor[];
  budget: TurnBudget;
  rollout: TurnRolloutSnapshot;
};

export type AmbiguityReceipt = {
  candidateTargetIds: string[];
  material: boolean;
  reasonCode: string;
};

export type LimitationReceipt = {
  code: string;
  retryable: boolean;
  missingInputs: string[];
};

export type ProposedToolCall = {
  callId: string;
  name: string;
  args: Record<string, unknown>;
};

export type EscalationReasonCode =
  | 'legal_risk'
  | 'conflicting_evidence'
  | 'deadline_uncertainty'
  | 'high_impact_draft'
  | 'validation_failure'
  | 'challenged_answer'
  | 'complexity_limit';

export type EscalationRequest = {
  fromModel: NexxModel;
  requestedModel: 'gpt-5.6-terra' | 'gpt-5.6-sol';
  reasonCode: EscalationReasonCode;
  evidenceIds: string[];
  remainingBudgetMicrousd: number;
};

export type KernelDecision =
  | { kind: 'answer'; answer: string }
  | { kind: 'clarify'; question: string; ambiguity: AmbiguityReceipt }
  | { kind: 'tool_call'; calls: ProposedToolCall[] }
  | { kind: 'escalate'; request: EscalationRequest }
  | { kind: 'limited'; message: string; limitation: LimitationReceipt };

export type ModelAttemptReceipt = {
  attemptId: string;
  model: NexxModel;
  reasoningEffort: ReasoningEffort;
  status: 'completed' | 'retry_scheduled' | 'failed';
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  estimatedCostMicrousd?: number;
  usageProvenance: 'provider_reported' | 'estimated' | 'unavailable';
  providerResponseId?: string;
  failureCode?: string;
  startedAt: number;
  completedAt?: number;
};

export type ToolCallReceipt = {
  toolCallId: string;
  toolName: string;
  status: 'completed' | 'rejected' | 'failed';
  authorizationScopeHash: string;
  resourceIds: string[];
  evidenceIds: string[];
  sideEffect: 'none' | 'reversible' | 'material';
  confirmationId?: string;
  failureCode?: string;
  startedAt: number;
  completedAt: number;
};

export type TaskTransitionReceipt = {
  taskId: string;
  from: BackgroundTaskStatus;
  to: BackgroundTaskStatus;
  reasonCode: string;
};

export type OutcomeValidationReceipt = {
  passed: boolean;
  verifierVersion: string;
  rejectionCodes: string[];
  requiresSemanticReview: boolean;
};

export type TurnReceipt = {
  turnId: string;
  outcome: 'answered' | 'clarified' | 'tool_used' | 'escalated' | 'limited' | 'failed';
  foregroundGoal: string;
  resolvedReferents: ReferentBinding[];
  modelAttempts: ModelAttemptReceipt[];
  toolCalls: ToolCallReceipt[];
  evidenceIds: string[];
  taskTransitions: TaskTransitionReceipt[];
  validation: OutcomeValidationReceipt;
  publicationId?: string;
  rolloutConfigVersion: number;
  createdAt: number;
};
