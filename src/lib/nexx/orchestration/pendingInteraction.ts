import type { AssistantOffer, PendingAct, PendingOption } from './types';

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim().replace(/[?.!]+$/, '').slice(0, 240);
}

function optionId(label: string, index: number, focusRevision: number) {
  return `option_${focusRevision}_${index}_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) || 'choice'}`;
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
  focusRevision: number;
  sourceMessageId?: string;
}): { pendingAct?: PendingAct; options: PendingOption[]; offer?: AssistantOffer } {
  const asksChoice = /\b(?:which|choose|select|what\s+would\s+you\s+like|which\s+would\s+help)\b/i.test(args.content);
  const bulletOptions = extractBulletOptions(args.content);
  const colonOptions = extractColonOptions(args.content);
  const labels = Array.from(new Set((bulletOptions.length >= 2 ? bulletOptions : colonOptions).map(compact))).slice(0, 8);
  if (asksChoice && labels.length >= 2) {
    return {
      pendingAct: 'select',
      options: labels.map((label, index) => ({
        optionId: optionId(label, index, args.focusRevision),
        label,
        aliases: [label, `${index + 1}`, ['first', 'second', 'third', 'fourth'][index]].filter((value): value is string => Boolean(value)),
        action: /\b(?:file|order|document|pdf)\b/i.test(label) ? 'select_document' : 'select_scope',
        targetTaskId: args.taskId,
        documentIds: args.documentIds,
        sourceMessageId: args.sourceMessageId,
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
        optionId: optionId(object, 0, args.focusRevision),
        label: object,
        aliases: ['yes', 'please do so', 'do it', 'okay', 'sure'],
        action: 'confirm_action',
        targetTaskId: args.taskId,
        documentIds: args.documentIds,
        sourceMessageId: args.sourceMessageId,
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

