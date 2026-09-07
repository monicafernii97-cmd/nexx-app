import type { SubscriptionTier } from '../../tiers';
import { isDocumentAvailabilityQuestion, type DocumentReferenceDetection } from '../documentReferenceDetection';
import { buildTurnBudget, type TurnRiskClass } from './budgetPolicy';
import type {
  AuthorizedResourceDescriptor,
  BackgroundTaskDescriptor,
  ConversationMessage,
  ConversationTurnContext,
  ReferentBinding,
  TurnRolloutSnapshot,
} from './contracts';
import { buildConversationTurnContext } from './contextBuilder';
import { resolveModelPolicy, type ModelPolicyDecision, type ModelRiskSignals } from './modelPolicy';
import { resolveTurnReferents } from './referentResolver';

export type KernelResponseProfile = 'natural' | 'grounded_document' | 'procedural' | 'artifact';

export type ConversationKernelPlan = {
  foregroundGoal: string;
  responseProfile: KernelResponseProfile;
  directAnswerDefault: boolean;
  clarificationRequired: boolean;
  clarificationReason?: string;
  resolvedReferents: ReferentBinding[];
  authorizedDocumentIds: string[];
  requiredEvidence: boolean;
  allowedToolNames: string[];
  riskClass: TurnRiskClass;
  modelPolicy: ModelPolicyDecision;
  context: ConversationTurnContext;
  contextReceipt: ReturnType<typeof buildConversationTurnContext>['receipt'];
};

const PERSONALIZED_LEGAL = /\b(?:my|our|me|i|he|she|they|other parent|ex)\b.{0,100}\b(?:court|custody|conservator|possession|visitation|support|order|rights?|allowed|required|file|hearing|deadline)\b|\b(?:can|must|should)\s+(?:he|she|they|i)\b/i;
const PROCEDURE = /\b(?:how\s+do\s+i\s+file|filing\s+procedure|local\s+rule|court\s+procedure|deadline|service\s+requirements?|where\s+do\s+i\s+file)\b/i;
const ARTIFACT = /\b(?:draft|prepare|create|write)\b.{0,100}\b(?:motion|petition|declaration|pleading|proposed\s+order|filing|court\s+response)\b/i;
const CURRENT_AUTHORITY = /\b(?:current|latest|today(?:'s)?|verify|look\s+up)\b.{0,100}\b(?:law|statute|rule|procedure|deadline|court)\b/i;
const AWAITING_NEW_UPLOAD = /\b(?:i(?:'ll| will| am going to)?|let me|hold on(?: while)?)\s+(?:re-?upload|upload|attach|send)\b/i;
const UNKNOWN_SHORTHAND = /^[A-Z0-9][A-Z0-9._-]{1,7}\??$/;

function riskSignals(args: {
  message: string;
  responseProfile: KernelResponseProfile;
  documentReference: DocumentReferenceDetection;
  challengedAnswer: boolean;
}) {
  const personalizedLegalInterpretation = PERSONALIZED_LEGAL.test(args.message);
  const deadlineCalculation = /\b(?:deadline|due date|days? (?:after|before)|calculate)\b/i.test(args.message);
  const courtReadyDraft = args.responseProfile === 'artifact';
  const conflictingEvidence = /\b(?:conflict|contradict|different versions?|which (?:clause|order) controls)\b/i.test(args.message);
  const signals: ModelRiskSignals = {
    lowRiskConversation: args.responseProfile === 'natural' && !personalizedLegalInterpretation && !deadlineCalculation,
    personalizedLegalInterpretation,
    documentGroundedConclusion: args.responseProfile === 'grounded_document',
    jurisdictionDependentProcedure: args.responseProfile === 'procedural',
    deadlineCalculation,
    courtReadyDraft,
    currentSafetyRisk: /\b(?:immediate danger|unsafe right now|call 911|kill|weapon|kidnap)\b/i.test(args.message),
    challengedSubstantiveAnswer: args.challengedAnswer,
    conflictingEvidence,
    highImpactSideEffect: courtReadyDraft,
    exceptionalComplexity: args.message.length > 4_000 || conflictingEvidence,
  };
  return signals;
}

function riskClassFor(profile: KernelResponseProfile, signals: ModelRiskSignals): TurnRiskClass {
  if (profile === 'artifact') return 'exceptional_artifact';
  if (profile === 'grounded_document') return 'tool_grounded';
  if (profile === 'procedural' || signals.personalizedLegalInterpretation) return 'nuanced_legal';
  return signals.lowRiskConversation ? 'social' : 'ordinary';
}

/** Plan a turn from current intent and authorized state without reading routeMode. */
export function planConversationTurn(args: {
  turnId: string;
  conversationId: string;
  userId: string;
  tenantId: string;
  tier: SubscriptionTier;
  message: string;
  recentMessages: ConversationMessage[];
  tasks: BackgroundTaskDescriptor[];
  resources: AuthorizedResourceDescriptor[];
  currentAttachmentIds: string[];
  selectedDocumentIds: string[];
  executedPendingAction?: boolean;
  documentReference: DocumentReferenceDetection;
  availableTools: ConversationTurnContext['availableTools'];
  rollout: TurnRolloutSnapshot;
  summary?: ConversationTurnContext['summary'];
  challengedAnswer?: boolean;
  remainingDailyBudgetMicrousd?: number;
}): ConversationKernelPlan {
  const referents = resolveTurnReferents({
    message: args.message,
    recentMessages: args.recentMessages,
    tasks: args.tasks,
    resources: args.resources,
    referencedResourceIds: args.selectedDocumentIds,
  });
  const authorizedResourceIds = new Set(args.resources
    .filter((resource) => resource.state === 'available')
    .map((resource) => resource.resourceId));
  const resumedTaskIds = new Set(referents.bindings
    .filter((binding) => binding.kind === 'task')
    .map((binding) => binding.targetId));
  const resumedTaskResourceIds = args.tasks
    .filter((task) => resumedTaskIds.has(task.taskId))
    .flatMap((task) => task.resourceIds);
  const documentIds = Array.from(new Set([
    ...args.currentAttachmentIds,
    ...args.selectedDocumentIds,
    ...resumedTaskResourceIds,
  ]))
    .filter((id) => authorizedResourceIds.has(id));
  const documentRequested = !AWAITING_NEW_UPLOAD.test(args.message) && documentIds.length > 0 && (
    args.currentAttachmentIds.length > 0 ||
    args.executedPendingAction === true ||
    args.documentReference.referencesDocument ||
    referents.bindings.some((binding) => binding.kind === 'document' || binding.kind === 'task')
  );
  const metadataOnlyDocumentQuestion = documentRequested && isDocumentAvailabilityQuestion(args.message);
  const responseProfile: KernelResponseProfile = ARTIFACT.test(args.message)
    ? 'artifact'
    : documentRequested && !metadataOnlyDocumentQuestion
      ? 'grounded_document'
      : PROCEDURE.test(args.message)
        ? 'procedural'
        : 'natural';
  const signals = riskSignals({
    message: args.message,
    responseProfile,
    documentReference: args.documentReference,
    challengedAnswer: Boolean(args.challengedAnswer),
  });
  const riskClass = riskClassFor(responseProfile, signals);
  const budget = buildTurnBudget({ riskClass, remainingDailyBudgetMicrousd: args.remainingDailyBudgetMicrousd });
  const modelPolicy = resolveModelPolicy({ tier: args.tier, signals });
  const allowedToolNames = [
    ...(documentRequested && !metadataOnlyDocumentQuestion ? ['search_authorized_documents', 'read_document_pages'] : []),
    ...(documentRequested ? ['get_document_metadata', 'inspect_document_processing_status'] : []),
    ...(documentRequested && /\b(?:compare|difference|version|amended|supersed)/i.test(args.message) ? ['compare_document_versions'] : []),
    ...(CURRENT_AUTHORITY.test(args.message) ? ['verify_current_law'] : []),
    ...(responseProfile === 'procedural' ? ['lookup_local_procedure'] : []),
    ...(responseProfile === 'artifact' ? ['create_draft_artifact'] : []),
    ...(args.challengedAnswer ? ['inspect_prior_turn_receipt'] : []),
    ...(resumedTaskIds.size > 0 ? ['resume_background_task', 'save_task_checkpoint'] : []),
  ];
  const built = buildConversationTurnContext({
    turnId: args.turnId,
    conversationId: args.conversationId,
    userId: args.userId,
    tenantId: args.tenantId,
    message: args.message,
    recentMessages: args.recentMessages,
    summary: args.summary,
    immediateReferents: referents.bindings,
    tasks: args.tasks,
    resources: args.resources,
    availableTools: args.availableTools.filter((tool) => allowedToolNames.includes(tool.name)),
    budget,
    rollout: args.rollout,
  });
  const unknownShorthand = UNKNOWN_SHORTHAND.test(args.message.trim());
  return {
    foregroundGoal: args.message.trim(),
    responseProfile,
    directAnswerDefault: !referents.ambiguity.material && !unknownShorthand,
    clarificationRequired: referents.ambiguity.material || unknownShorthand,
    clarificationReason: referents.ambiguity.material
      ? referents.ambiguity.reasonCode
      : unknownShorthand
        ? 'unknown_shorthand_without_resolved_referent'
        : undefined,
    resolvedReferents: referents.bindings,
    authorizedDocumentIds: documentRequested ? documentIds : [],
    requiredEvidence: documentRequested && !metadataOnlyDocumentQuestion,
    allowedToolNames,
    riskClass,
    modelPolicy,
    context: built.context,
    contextReceipt: built.receipt,
  };
}
