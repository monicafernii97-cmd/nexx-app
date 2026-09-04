import type { RouteMode } from '../../types';

export type SpeechAct =
  | 'ask'
  | 'answer'
  | 'select'
  | 'confirm'
  | 'continue'
  | 'clarify'
  | 'correct'
  | 'challenge'
  | 'reassess'
  | 'cancel'
  | 'switch_topic'
  | 'social'
  | 'unknown';

export type ContinuityKind = 'same_task' | 'related_task' | 'new_task' | 'uncertain';

export type ConversationTaskKind =
  | 'document_review'
  | 'document_question'
  | 'legal_question'
  | 'draft'
  | 'strategy'
  | 'procedure'
  | 'relational'
  | 'general';

export type PendingAct = 'select' | 'confirm' | 'continue' | 'clarify' | 'supply_detail' | 'await_upload';

export type PendingOption = {
  optionId: string;
  label: string;
  aliases: string[];
  action: 'select_document' | 'select_scope' | 'confirm_action' | 'supply_fact';
  targetTaskId: string;
  documentIds: string[];
  sourceMessageId?: string;
  expiresAfterFocusRevision: number;
};

export type AssistantOffer = {
  act: 'select' | 'confirm' | 'continue' | 'clarify' | 'supply_detail';
  object: string;
  targetTaskId: string;
  documentIds: string[];
  sourceTurnId?: string;
};

export type ConversationControlSnapshot = {
  schemaVersion: 1;
  focusRevision: number;
  activeTaskId?: string;
  activeTaskKind?: ConversationTaskKind;
  activeIssueKey?: string;
  activeDocumentIds: string[];
  activeEvidenceGenerationIds: string[];
  parentTaskId?: string;
  pendingAct?: PendingAct;
  pendingOptions: PendingOption[];
  lastAssistantOffer?: AssistantOffer;
  confidence: number;
  provenance: 'native_v1' | 'migrated_route' | 'migrated_issue' | 'recovered';
};

export type ConversationTaskSnapshot = {
  taskId: string;
  parentTaskId?: string;
  kind: ConversationTaskKind;
  status: 'provisional' | 'active' | 'waiting_user' | 'waiting_system' | 'completed' | 'superseded' | 'abandoned';
  goal: string;
  normalizedGoal: string;
  issueKey?: string;
  documentIds: string[];
  evidenceGenerationIds: string[];
  updatedAt?: number;
};

export type TurnReferent = {
  text: string;
  resolvedType?: 'task' | 'document' | 'option' | 'offer' | 'message';
  resolvedId?: string;
  confidence: number;
  reasonCodes: string[];
};

export type TurnUnderstanding = {
  schemaVersion: 1;
  speechAct: SpeechAct;
  continuity: ContinuityKind;
  requestedOperation?: string;
  referents: TurnReferent[];
  candidateTasks: Array<{ taskId: string; score: number; reasonCodes: string[] }>;
  confidence: number;
  ambiguityMaterial: boolean;
  reasonCodes: string[];
  resolverVersion: string;
};

export type TurnUnderstandingInput = {
  message: string;
  currentAttachments?: Array<{ uploadedFileId: string; filename: string }>;
  controlState?: ConversationControlSnapshot;
  activeTasks?: ConversationTaskSnapshot[];
  recentUserTurns?: Array<{ id?: string; content: string }>;
  recentAssistantTurns?: Array<{
    id?: string;
    content: string;
    offer?: AssistantOffer;
    pendingOptions?: PendingOption[];
  }>;
  conversationSummary?: string;
  activeDocumentDescriptors?: Array<{ uploadedFileId: string; filename: string; aliases?: string[] }>;
  foregroundIntentV2?: boolean;
};

export type FocusTransition =
  | { kind: 'retain'; reasonCodes: string[] }
  | { kind: 'refine'; taskId: string; patch: TaskRefinement; reasonCodes: string[] }
  | { kind: 'branch'; parentTaskId: string; newTask: ProvisionalTask; reasonCodes: string[] }
  | { kind: 'replace'; previousTaskId?: string; newTask: ProvisionalTask; reasonCodes: string[] }
  | { kind: 'clarify'; candidateIds: string[]; reasonCodes: string[] };

export type TaskRefinement = {
  goal?: string;
  documentIds?: string[];
  selectedOptionId?: string;
  requestedOperation?: string;
};

export type ProvisionalTask = {
  taskId: string;
  parentTaskId?: string;
  kind: ConversationTaskKind;
  goal: string;
  normalizedGoal: string;
  documentIds: string[];
};

export type QuestionKind =
  | 'yes_no'
  | 'either_or'
  | 'selection'
  | 'meaning'
  | 'schedule'
  | 'communication'
  | 'scope'
  | 'capability'
  | 'confirmation'
  | 'correction'
  | 'status'
  | 'open_analysis'
  | 'other';

export type TurnExecutionPlan = {
  schemaVersion: 1;
  planId: string;
  taskId: string;
  focusRevision: number;
  responseAct: 'answer' | 'clarify' | 'confirm' | 'correct' | 'status' | 'safe_limit';
  routeMode: RouteMode;
  selectedDocumentIds: string[];
  evidenceRequirements: string[];
  retrievalQueries: string[];
  capabilityRequirements: string[];
  fallbackOrder: string[];
  questionKind: QuestionKind;
};

