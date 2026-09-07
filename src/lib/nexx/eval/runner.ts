import { detectDocumentReference } from '../documentReferenceDetection';
import { planConversationTurn } from '../conversation/kernel';
import type { ConversationEvalCase } from './cases';

const rollout = {
  configVersion: 2,
  kernelMode: 'enforce' as const,
  contextBuilderMode: 'enforce' as const,
  taskLedgerMode: 'enforce' as const,
  toolBrokerMode: 'enforce' as const,
  outcomeVerifierMode: 'enforce' as const,
  modelPolicyMode: 'enforce' as const,
  routeModeAuthority: 'off' as const,
};

export function runConversationEvalCase(testCase: ConversationEvalCase) {
  const scope = `eval-scope:${testCase.id}`;
  const plan = planConversationTurn({
    turnId: `turn:${testCase.id}`,
    conversationId: `conversation:${testCase.id}`,
    userId: 'eval-user',
    tenantId: 'eval-tenant',
    tier: 'premium',
    message: testCase.message,
    recentMessages: testCase.recentMessages,
    tasks: testCase.tasks,
    resources: testCase.resources.map((resource) => ({ ...resource, authorizationScopeHash: scope })),
    currentAttachmentIds: testCase.currentAttachmentIds,
    selectedDocumentIds: testCase.selectedDocumentIds,
    executedPendingAction: testCase.executedPendingAction,
    documentReference: detectDocumentReference(testCase.message),
    availableTools: [
      { name: 'read_document_pages', description: 'Read authorized pages.', sideEffect: 'none', requiresConfirmation: false, authorizationScopeHash: scope },
      { name: 'verify_current_law', description: 'Search current authority.', sideEffect: 'none', requiresConfirmation: false, authorizationScopeHash: scope },
      { name: 'lookup_local_procedure', description: 'Search local procedure.', sideEffect: 'none', requiresConfirmation: false, authorizationScopeHash: scope },
      { name: 'create_draft_artifact', description: 'Create an artifact.', sideEffect: 'reversible', requiresConfirmation: false, authorizationScopeHash: scope },
    ],
    rollout,
  });
  const failures: string[] = [];
  if (testCase.expected.foregroundGoalExact && plan.foregroundGoal !== testCase.message.trim()) failures.push('foreground_goal_mismatch');
  if (plan.responseProfile !== testCase.expected.responseProfile) failures.push('response_profile_mismatch');
  if (plan.clarificationRequired !== testCase.expected.clarificationRequired) failures.push('clarification_mismatch');
  if (plan.requiredEvidence !== testCase.expected.requiredEvidence) failures.push('evidence_requirement_mismatch');
  if (testCase.expected.referentKind && !plan.resolvedReferents.some((referent) => referent.kind === testCase.expected.referentKind)) {
    failures.push('referent_mismatch');
  }
  return { id: testCase.id, category: testCase.category, passed: failures.length === 0, failures, plan };
}

export function runConversationEvalCorpus(cases: ConversationEvalCase[]) {
  return cases.map(runConversationEvalCase);
}
