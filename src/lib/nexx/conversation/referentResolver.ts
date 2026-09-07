import type {
  AuthorizedResourceDescriptor,
  BackgroundTaskDescriptor,
  ConversationMessage,
  ReferentBinding,
} from './contracts';
import { selectExplicitlyResumedTask } from './taskLedger';

const IMMEDIATE_FOLLOW_UP = /^(?:and\s+)?(?:what|how|why|when|where|who)\b|\b(?:that|this|it|those|these)\b/i;
const EXPLICIT_DOCUMENT = /\b(?:order|document|file|pdf|attachment|page|clause|section)\b/i;

function tokens(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
}

function labelScore(message: string, label: string) {
  const haystack = new Set(tokens(message));
  const labelTokens = tokens(label);
  return labelTokens.length === 0 ? 0 : labelTokens.filter((token) => haystack.has(token)).length / labelTokens.length;
}

export type ReferentResolution = {
  bindings: ReferentBinding[];
  ambiguity: {
    material: boolean;
    candidateTargetIds: string[];
    reasonCode: string;
  };
};

/** Resolve current-turn language with immediate dialogue ahead of durable task state. */
export function resolveTurnReferents(args: {
  message: string;
  recentMessages: ConversationMessage[];
  tasks: BackgroundTaskDescriptor[];
  resources: AuthorizedResourceDescriptor[];
  referencedTaskId?: string;
  referencedResourceIds?: string[];
}): ReferentResolution {
  const bindings: ReferentBinding[] = [];
  const activeMessages = args.recentMessages.filter((message) => !message.superseded && message.content.trim());
  const lastAssistant = [...activeMessages].reverse().find((message) => message.role === 'assistant');
  const explicitlyResumed = selectExplicitlyResumedTask(args);
  if (explicitlyResumed) {
    bindings.push({
      phrase: args.message,
      kind: 'task',
      targetId: explicitlyResumed.taskId,
      sourceMessageId: lastAssistant?.id ?? 'current-turn',
      confidence: 0.98,
    });
  }

  if (EXPLICIT_DOCUMENT.test(args.message)) {
    const available = args.resources.filter((resource) => resource.kind === 'document' && resource.state === 'available');
    const scored = available
      .map((resource) => ({ resource, score: labelScore(args.message, resource.label) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);
    const explicitIds = new Set(args.referencedResourceIds ?? []);
    const matches = explicitIds.size > 0
      ? available.filter((resource) => explicitIds.has(resource.resourceId))
      : scored.length > 0 && (scored.length === 1 || scored[0].score > scored[1].score)
        ? [scored[0].resource]
        : available.length === 1
          ? available
          : [];
    if (matches.length === 1) {
      bindings.push({
        phrase: args.message,
        kind: 'document',
        targetId: matches[0].resourceId,
        sourceMessageId: lastAssistant?.id ?? 'current-turn',
        confidence: explicitIds.size > 0 ? 1 : 0.9,
      });
    } else if (available.length > 1) {
      return {
        bindings,
        ambiguity: {
          material: true,
          candidateTargetIds: available.map((resource) => resource.resourceId),
          reasonCode: 'multiple_authorized_documents_match',
        },
      };
    }
  }

  if (!explicitlyResumed && lastAssistant && IMMEDIATE_FOLLOW_UP.test(args.message)) {
    bindings.unshift({
      phrase: args.message,
      kind: 'result',
      targetId: lastAssistant.id,
      sourceMessageId: lastAssistant.id,
      confidence: 0.96,
    });
  }

  return {
    bindings,
    ambiguity: { material: false, candidateTargetIds: [], reasonCode: 'resolved_or_not_required' },
  };
}
