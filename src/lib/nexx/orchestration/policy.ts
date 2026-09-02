export const ORCHESTRATION_POLICY_VERSION = 'exec-chat-v1';
export const AUTO_RESOLVE_THRESHOLD = 0.72;
export const AUTO_RESOLVE_MARGIN = 0.18;

export const CANDIDATE_WEIGHTS = {
  exactPendingOptionAlias: 0.35,
  directDocumentMatch: 0.3,
  pendingActMatch: 0.25,
  unansweredAssistantQuestion: 0.2,
  requestedOperationMatch: 0.15,
  activeTask: 0.15,
  activeDocument: 0.1,
  recentRelatedTask: 0.05,
  explicitIncompatibleTopic: -0.35,
  expiredOption: -0.25,
  authorizationFailure: -1,
} as const;

export function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, value));
}

