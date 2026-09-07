import type {
  AuthorizedResourceDescriptor,
  BackgroundTaskDescriptor,
  ConversationMessage,
} from '../conversation/contracts';
import type { KernelResponseProfile } from '../conversation/kernel';

export type ConversationEvalExpectation = {
  responseProfile: KernelResponseProfile;
  clarificationRequired: boolean;
  requiredEvidence: boolean;
  referentKind?: 'result' | 'document' | 'task';
  foregroundGoalExact: boolean;
};

export type ConversationEvalCase = {
  id: string;
  category: 'frozen_incident' | 'follow_up' | 'topic_switch' | 'task_resume' | 'document' | 'ambiguity' | 'correction';
  message: string;
  recentMessages: ConversationMessage[];
  tasks: BackgroundTaskDescriptor[];
  resources: AuthorizedResourceDescriptor[];
  currentAttachmentIds: string[];
  selectedDocumentIds: string[];
  executedPendingAction?: boolean;
  expected: ConversationEvalExpectation;
};

const now = 1_780_000_000_000;
const mediationDialogue: ConversationMessage[] = [
  { id: 'u-mediation', role: 'user', content: 'What is mediation?', createdAt: now - 2 },
  { id: 'a-mediation', role: 'assistant', content: 'Mediation is a structured negotiation led by a neutral mediator.', createdAt: now - 1 },
];
const historicalDocument: AuthorizedResourceDescriptor = {
  resourceId: 'doc-order',
  kind: 'document',
  label: 'Parenting Order.pdf',
  state: 'available',
  authorizationScopeHash: 'scope-order',
};
const secondDocument: AuthorizedResourceDescriptor = {
  resourceId: 'doc-motion',
  kind: 'document',
  label: 'Motion.pdf',
  state: 'available',
  authorizationScopeHash: 'scope-motion',
};
const reviewTask: BackgroundTaskDescriptor = {
  taskId: 'task-order-review',
  goal: 'Review the parenting order',
  status: 'suspended',
  resourceIds: ['doc-order'],
  lastTouchedAt: now - 20,
};

export const FROZEN_INCIDENT_CASES: ConversationEvalCase[] = [
  {
    id: 'incident-mediation-follow-up', category: 'frozen_incident', message: 'What does it look like?',
    recentMessages: mediationDialogue, tasks: [reviewTask], resources: [historicalDocument],
    currentAttachmentIds: [], selectedDocumentIds: [],
    expected: { responseProfile: 'natural', clarificationRequired: false, requiredEvidence: false, referentKind: 'result', foregroundGoalExact: true },
  },
  {
    id: 'incident-greeting-after-document', category: 'frozen_incident', message: 'Hi',
    recentMessages: [], tasks: [reviewTask], resources: [historicalDocument], currentAttachmentIds: [], selectedDocumentIds: ['doc-order'],
    expected: { responseProfile: 'natural', clarificationRequired: false, requiredEvidence: false, foregroundGoalExact: true },
  },
  {
    id: 'incident-future-upload', category: 'frozen_incident', message: "I'll upload the new copy tomorrow.",
    recentMessages: [], tasks: [reviewTask], resources: [historicalDocument], currentAttachmentIds: [], selectedDocumentIds: ['doc-order'],
    expected: { responseProfile: 'natural', clarificationRequired: false, requiredEvidence: false, foregroundGoalExact: true },
  },
  {
    id: 'incident-accept-recommendation', category: 'frozen_incident', message: 'Yes, please do that.',
    recentMessages: [{ id: 'a-offer', role: 'assistant', content: 'I recommend a complete review.', createdAt: now - 1 }],
    tasks: [reviewTask], resources: [historicalDocument], currentAttachmentIds: [], selectedDocumentIds: ['doc-order'], executedPendingAction: true,
    expected: { responseProfile: 'grounded_document', clarificationRequired: false, requiredEvidence: true, foregroundGoalExact: true },
  },
  {
    id: 'incident-unknown-shorthand', category: 'frozen_incident', message: 'ZQX?',
    recentMessages: [], tasks: [reviewTask], resources: [historicalDocument], currentAttachmentIds: [], selectedDocumentIds: [],
    expected: { responseProfile: 'natural', clarificationRequired: true, requiredEvidence: false, foregroundGoalExact: true },
  },
  {
    id: 'incident-contextual-math', category: 'frozen_incident', message: 'What about twice that?',
    recentMessages: [{ id: 'u-math', role: 'user', content: 'What is 9 + 6?', createdAt: now - 2 }, { id: 'a-math', role: 'assistant', content: '15', createdAt: now - 1 }],
    tasks: [reviewTask], resources: [historicalDocument], currentAttachmentIds: [], selectedDocumentIds: [],
    expected: { responseProfile: 'natural', clarificationRequired: false, requiredEvidence: false, referentKind: 'result', foregroundGoalExact: true },
  },
  {
    id: 'incident-unreadable-file-claim', category: 'frozen_incident', message: 'What is mediation?',
    recentMessages: [], tasks: [reviewTask], resources: [historicalDocument], currentAttachmentIds: [], selectedDocumentIds: [],
    expected: { responseProfile: 'natural', clarificationRequired: false, requiredEvidence: false, foregroundGoalExact: true },
  },
  {
    id: 'incident-completed-analysis-followup', category: 'frozen_incident', message: 'Can you explain that more simply?',
    recentMessages: mediationDialogue, tasks: [reviewTask], resources: [historicalDocument], currentAttachmentIds: [], selectedDocumentIds: [],
    expected: { responseProfile: 'natural', clarificationRequired: false, requiredEvidence: false, referentKind: 'result', foregroundGoalExact: true },
  },
  {
    id: 'incident-new-topic-open-review', category: 'frozen_incident', message: 'How do rainbows form?',
    recentMessages: [], tasks: [reviewTask], resources: [historicalDocument], currentAttachmentIds: [], selectedDocumentIds: [],
    expected: { responseProfile: 'natural', clarificationRequired: false, requiredEvidence: false, foregroundGoalExact: true },
  },
  {
    id: 'incident-resume-review', category: 'frozen_incident', message: "Let's return to the parenting order review.",
    recentMessages: mediationDialogue, tasks: [reviewTask], resources: [historicalDocument], currentAttachmentIds: [], selectedDocumentIds: [],
    expected: { responseProfile: 'grounded_document', clarificationRequired: false, requiredEvidence: true, referentKind: 'task', foregroundGoalExact: true },
  },
  {
    id: 'incident-upload-receipt-only', category: 'frozen_incident',
    message: 'Confirm that you received this synthetic test document in one short sentence.',
    recentMessages: [], tasks: [], resources: [historicalDocument],
    currentAttachmentIds: ['doc-order'], selectedDocumentIds: ['doc-order'],
    expected: { responseProfile: 'natural', clarificationRequired: false, requiredEvidence: false, referentKind: 'document', foregroundGoalExact: true },
  },
];

const naturalTopics = [
  ['mediation', 'Mediation is a guided negotiation.', 'What does it look like?'],
  ['arbitration', 'Arbitration is a private decision process.', 'How does that work?'],
  ['photosynthesis', 'Plants turn light into stored chemical energy.', 'Can you simplify that?'],
  ['gravity', 'Gravity attracts masses toward one another.', 'Why does it do that?'],
  ['appeals', 'An appeal asks a higher court to review a decision.', 'When can that happen?'],
  ['budgeting', 'A budget is a plan for income and spending.', 'What would one look like?'],
] as const;

function followUpCases(): ConversationEvalCase[] {
  const forms = ['What does it look like?', 'How does that work?', 'Can you explain it more simply?', 'Why is that useful?', 'What happens next?'];
  return Array.from({ length: 60 }, (_, index) => {
    const topic = naturalTopics[index % naturalTopics.length];
    const message = forms[index % forms.length];
    return {
      id: `follow-up-${index + 1}`, category: 'follow_up' as const, message,
      recentMessages: [
        { id: `fu-u-${index}`, role: 'user' as const, content: `What is ${topic[0]}?`, createdAt: now - 2 },
        { id: `fu-a-${index}`, role: 'assistant' as const, content: topic[1], createdAt: now - 1 },
      ],
      tasks: index % 2 === 0 ? [reviewTask] : [], resources: index % 2 === 0 ? [historicalDocument] : [],
      currentAttachmentIds: [], selectedDocumentIds: [],
      expected: { responseProfile: 'natural' as const, clarificationRequired: false, requiredEvidence: false, referentKind: 'result' as const, foregroundGoalExact: true },
    };
  });
}

function topicSwitchCases(): ConversationEvalCase[] {
  const messages = ['How do rainbows form?', 'What is 12 times 4?', 'Help me plan a grocery list.', 'What makes bread rise?', 'Tell me about Saturn.'];
  return Array.from({ length: 45 }, (_, index) => ({
    id: `topic-switch-${index + 1}`, category: 'topic_switch' as const, message: messages[index % messages.length],
    recentMessages: mediationDialogue, tasks: [reviewTask], resources: [historicalDocument],
    currentAttachmentIds: [], selectedDocumentIds: [],
    expected: { responseProfile: 'natural' as const, clarificationRequired: false, requiredEvidence: false, foregroundGoalExact: true },
  }));
}

function resumeCases(): ConversationEvalCase[] {
  const forms = [
    "Let's return to the parenting order review.",
    'Resume the parenting order review.',
    'Can we continue the parenting order task?',
    'Go back to the parenting order review.',
  ];
  return Array.from({ length: 35 }, (_, index) => ({
    id: `task-resume-${index + 1}`, category: 'task_resume' as const, message: forms[index % forms.length],
    recentMessages: mediationDialogue, tasks: [reviewTask], resources: [historicalDocument],
    currentAttachmentIds: [], selectedDocumentIds: [],
    expected: { responseProfile: 'grounded_document' as const, clarificationRequired: false, requiredEvidence: true, referentKind: 'task' as const, foregroundGoalExact: true },
  }));
}

function documentCases(): ConversationEvalCase[] {
  const forms = ['What does the parenting order say about weekends?', 'Summarize this document.', 'Read page 4 of the attached file.', 'Compare this clause with the order.'];
  return Array.from({ length: 35 }, (_, index) => ({
    id: `document-${index + 1}`, category: 'document' as const, message: forms[index % forms.length], recentMessages: [], tasks: [],
    resources: [historicalDocument], currentAttachmentIds: index % 2 === 0 ? ['doc-order'] : [], selectedDocumentIds: ['doc-order'],
    expected: { responseProfile: 'grounded_document' as const, clarificationRequired: false, requiredEvidence: true, referentKind: 'document' as const, foregroundGoalExact: true },
  }));
}

function ambiguityCases(): ConversationEvalCase[] {
  return Array.from({ length: 20 }, (_, index) => ({
    id: `ambiguity-${index + 1}`, category: 'ambiguity' as const, message: 'What does the document say about deadlines?', recentMessages: [], tasks: [],
    resources: [historicalDocument, secondDocument], currentAttachmentIds: [], selectedDocumentIds: [],
    expected: { responseProfile: 'natural' as const, clarificationRequired: true, requiredEvidence: false, foregroundGoalExact: true },
  }));
}

function correctionCases(): ConversationEvalCase[] {
  const messages = ["That's wrong—the meeting is Tuesday.", 'Actually, I was served on June 3.', 'No, use Illinois rather than Texas.', 'That answer missed the exception.'];
  return Array.from({ length: 20 }, (_, index) => ({
    id: `correction-${index + 1}`, category: 'correction' as const, message: messages[index % messages.length],
    recentMessages: [{ id: `corr-a-${index}`, role: 'assistant' as const, content: 'The meeting is Monday.', createdAt: now - 1 }],
    tasks: [], resources: [], currentAttachmentIds: [], selectedDocumentIds: [],
    expected: { responseProfile: 'natural' as const, clarificationRequired: false, requiredEvidence: false, foregroundGoalExact: true },
  }));
}

export const CONVERSATION_EVAL_CASES: ConversationEvalCase[] = [
  ...FROZEN_INCIDENT_CASES,
  ...followUpCases(),
  ...topicSwitchCases(),
  ...resumeCases(),
  ...documentCases(),
  ...ambiguityCases(),
  ...correctionCases(),
];
