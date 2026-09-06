import type { AssistantOffer, PendingAct, PendingOperation, PendingOption } from './types';

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim().replace(/[?.!]+$/, '').slice(0, 240);
}

function optionId(label: string, index: number, focusRevision: number) {
  return `option_${focusRevision}_${index}_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) || 'choice'}`;
}

function interactionId(taskId: string, focusRevision: number, labels: string[]) {
  let hash = 2166136261;
  for (const character of `${taskId}:${focusRevision}:${labels.join('|')}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `interaction_${(hash >>> 0).toString(36)}`;
}

function operationForLabel(label: string): PendingOperation | undefined {
  if (/\b(?:full[- ]document|exhaustive|complete)\s+review\b/i.test(label)) {
    return { kind: 'document_review', analysisMode: 'full_document_review' };
  }
  if (/\b(?:focused|specific|targeted)\s+(?:review|terms?|issue)\b/i.test(label)) {
    return { kind: 'document_review', analysisMode: 'focused_question' };
  }
  return undefined;
}

function extractBulletOptions(content: string) {
  return content.split(/\r?\n/)
    .map((line) => line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.{2,180})$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(compact)
    .filter((value) => value.length >= 2);
}

function extractColonOptions(content: string) {
  const match = content.match(/\b(?:which|choose|select|options?(?:\s+are)?|would\s+you\s+like)\b[^:\n]{0,100}:\s*([^?\n]{4,500})/i);
  if (!match) return [];
  return match[1]
    .replace(/\s+or\s+/gi, ',')
    .split(',')
    .map(compact)
    .filter((value) => value.length >= 2 && value.length <= 180);
}

export function derivePendingInteraction(args: {
  content: string;
  taskId: string;
  documentIds: string[];
  evidenceGenerationIds?: string[];
  focusRevision: number;
  sourceMessageId?: string;
  sourceTurnId?: string;
  sourcePlanId?: string;
  capabilitySnapshotHash?: string;
  authorizationScopeHash?: string;
}): { pendingAct?: PendingAct; options: PendingOption[]; offer?: AssistantOffer } {
  const asksChoice = /\b(?:which|choose|select|what\s+would\s+you\s+like|which\s+would\s+help)\b/i.test(args.content);
  const bulletOptions = extractBulletOptions(args.content);
  const colonOptions = extractColonOptions(args.content);
  const labels = Array.from(new Set((bulletOptions.length >= 2 ? bulletOptions : colonOptions).map(compact))).slice(0, 8);
  const resolvedInteractionId = interactionId(args.taskId, args.focusRevision, labels);
  if (asksChoice && labels.length >= 2) {
    return {
      pendingAct: 'select',
      options: labels.map((label, index) => ({
        schemaVersion: 2,
        optionId: optionId(label, index, args.focusRevision),
        interactionId: resolvedInteractionId,
        label,
        aliases: [label, `${index + 1}`, ['first', 'second', 'third', 'fourth'][index]].filter((value): value is string => Boolean(value)),
        action: /\b(?:file|order|document|pdf)\b/i.test(label) ? 'select_document' : 'select_scope',
        targetTaskId: args.taskId,
        documentIds: args.documentIds,
        evidenceGenerationIds: args.evidenceGenerationIds ?? [],
        sourceMessageId: args.sourceMessageId,
        sourceTurnId: args.sourceTurnId,
        sourcePlanId: args.sourcePlanId,
        capabilitySnapshotHash: args.capabilitySnapshotHash,
        authorizationScopeHash: args.authorizationScopeHash,
        operation: operationForLabel(label),
        expiresAfterFocusRevision: args.focusRevision,
      })),
    };
  }

  const offerMatch = args.content.match(/\b(?:i\s+can|would\s+you\s+like\s+me\s+to|do\s+you\s+want\s+me\s+to)\s+([^?.!]{4,220})[?.!]/i);
  if (offerMatch) {
    const object = compact(offerMatch[1]);
    return {
      pendingAct: 'confirm',
      options: [{
        schemaVersion: 2,
        optionId: optionId(object, 0, args.focusRevision),
        interactionId: resolvedInteractionId,
        label: object,
        aliases: ['yes', 'please do so', 'do it', 'okay', 'sure'],
        action: 'confirm_action',
        targetTaskId: args.taskId,
        documentIds: args.documentIds,
        evidenceGenerationIds: args.evidenceGenerationIds ?? [],
        sourceMessageId: args.sourceMessageId,
        sourceTurnId: args.sourceTurnId,
        sourcePlanId: args.sourcePlanId,
        capabilitySnapshotHash: args.capabilitySnapshotHash,
        authorizationScopeHash: args.authorizationScopeHash,
        operation: operationForLabel(object),
        expiresAfterFocusRevision: args.focusRevision,
      }],
      offer: {
        act: 'confirm',
        object,
        targetTaskId: args.taskId,
        documentIds: args.documentIds,
      },
    };
  }

  if (/\?$/.test(args.content.trim())) {
    return { pendingAct: 'clarify', options: [] };
  }
  return { options: [] };
}

export function createReviewDepthPendingInteraction(args: {
  taskId: string;
  documentIds: string[];
  evidenceGenerationIds?: string[];
  focusRevision: number;
  sourceTurnId?: string;
  sourceMessageId?: string;
  sourcePlanId?: string;
  capabilitySnapshotHash?: string;
  authorizationScopeHash?: string;
}) {
  const labels = [
    'A focused review of the terms or issue you care about',
    'A full-document review covering the entire current document',
  ];
  const resolvedInteractionId = interactionId(args.taskId, args.focusRevision, labels);
  const common = {
    schemaVersion: 2 as const,
    interactionId: resolvedInteractionId,
    targetTaskId: args.taskId,
    documentIds: args.documentIds,
    evidenceGenerationIds: args.evidenceGenerationIds ?? [],
    sourceTurnId: args.sourceTurnId,
    sourceMessageId: args.sourceMessageId,
    sourcePlanId: args.sourcePlanId,
    capabilitySnapshotHash: args.capabilitySnapshotHash,
    authorizationScopeHash: args.authorizationScopeHash,
    expiresAfterFocusRevision: args.focusRevision,
    action: 'select_scope' as const,
  };
  const options: PendingOption[] = [
    {
      ...common,
      optionId: optionId(labels[0], 0, args.focusRevision),
      label: labels[0],
      aliases: ['focused review', 'focused', 'specific issue', 'the focused one', 'first'],
      operation: { kind: 'document_review', analysisMode: 'focused_question' },
    },
    {
      ...common,
      optionId: optionId(labels[1], 1, args.focusRevision),
      label: labels[1],
      aliases: ['full-document review', 'full document review', 'full review', 'complete review', 'the complete one', 'second'],
      operation: { kind: 'document_review', analysisMode: 'full_document_review' },
    },
  ];
  return { pendingAct: 'select' as const, options, interactionId: resolvedInteractionId };
}

