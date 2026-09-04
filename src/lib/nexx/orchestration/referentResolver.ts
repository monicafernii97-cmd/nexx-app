import {
  AUTO_RESOLVE_MARGIN,
  AUTO_RESOLVE_THRESHOLD,
  CANDIDATE_WEIGHTS,
  clampConfidence,
} from './policy';
import type {
  ConversationTaskSnapshot,
  PendingOption,
  TurnReferent,
  TurnUnderstandingInput,
} from './types';

const ORDINALS: Record<string, number> = {
  first: 0,
  '1st': 0,
  one: 0,
  second: 1,
  '2nd': 1,
  two: 1,
  third: 2,
  '3rd': 2,
  three: 2,
  last: -1,
  latest: -1,
};

const REFERENTIAL_FRAGMENT = /^(?:which|what|that|this|it|those|these|one|ones|the\s+(?:first|second|third|last|latest|other|signed|unsigned)\s+one|former|latter|same)$/i;

function normalize(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[“”‘’]/g, "'")
    .replace(/[^\p{L}\p{N}'._-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function optionScore(message: string, option: PendingOption, focusRevision: number) {
  if (option.expiresAfterFocusRevision < focusRevision) {
    return { score: 0, reasons: ['expired_pending_option'] };
  }
  const normalizedMessage = normalize(message);
  const aliases = [option.label, ...option.aliases].map(normalize).filter(Boolean);
  if (aliases.some((alias) => alias === normalizedMessage)) {
    return { score: CANDIDATE_WEIGHTS.exactPendingOptionAlias + CANDIDATE_WEIGHTS.pendingActMatch + CANDIDATE_WEIGHTS.activeTask, reasons: ['exact_pending_option_alias', 'pending_act_match', 'active_task'] };
  }
  if (aliases.some((alias) => normalizedMessage.includes(alias) || alias.includes(normalizedMessage))) {
    return { score: CANDIDATE_WEIGHTS.pendingActMatch + CANDIDATE_WEIGHTS.activeTask, reasons: ['partial_pending_option_alias', 'active_task'] };
  }
  return { score: 0, reasons: [] };
}

function documentReferents(input: TurnUnderstandingInput): TurnReferent[] {
  const message = normalize(input.message);
  const descriptors = [
    ...(input.currentAttachments ?? []),
    ...(input.activeDocumentDescriptors ?? []),
  ].filter((item, index, values) => values.findIndex((candidate) => candidate.uploadedFileId === item.uploadedFileId) === index);
  const results: TurnReferent[] = [];

  for (const descriptor of descriptors) {
    const descriptorAliases = 'aliases' in descriptor && Array.isArray(descriptor.aliases)
      ? descriptor.aliases
      : [];
    const aliases = [descriptor.filename, ...descriptorAliases]
      .map(normalize)
      .filter(Boolean);
    if (aliases.some((alias) => message.includes(alias))) {
      results.push({
        text: descriptor.filename,
        resolvedType: 'document',
        resolvedId: descriptor.uploadedFileId,
        confidence: 0.95,
        reasonCodes: ['direct_document_name'],
      });
    }
  }

  // Human labels such as “the signed one” should prefer the uniquely signed
  // filename, while never confusing an `unsigned` filename with `signed`.
  if (results.length === 0 && /\b(?:signed|unsigned)\b/.test(message)) {
    const qualifier = /\bunsigned\b/.test(message) ? 'unsigned' : 'signed';
    const qualified = descriptors.filter((descriptor) => normalize(descriptor.filename).split(/[ ._-]+/).includes(qualifier));
    if (qualified.length === 1) {
      results.push({
        text: qualifier,
        resolvedType: 'document',
        resolvedId: qualified[0].uploadedFileId,
        confidence: 0.9,
        reasonCodes: ['unique_document_qualifier'],
      });
    }
  }

  const ordinalMatch = message.match(/\b(first|1st|one|second|2nd|two|third|3rd|three|last|latest)\b/);
  if (results.length === 0 && ordinalMatch && descriptors.length > 0) {
    const requestedIndex = ORDINALS[ordinalMatch[1]];
    const selected = requestedIndex === -1 ? descriptors[descriptors.length - 1] : descriptors[requestedIndex];
    if (selected) {
      results.push({
        text: ordinalMatch[1],
        resolvedType: 'document',
        resolvedId: selected.uploadedFileId,
        confidence: 0.82,
        reasonCodes: ['document_ordinal'],
      });
    }
  }

  if (results.length === 0 && /\b(?:it|this|that|the\s+file|the\s+order|the\s+document)\b/i.test(input.message)) {
    const activeIds = input.controlState?.activeDocumentIds ?? [];
    if (activeIds.length === 1) {
      results.push({
        text: input.message,
        resolvedType: 'document',
        resolvedId: activeIds[0],
        confidence: 0.78,
        reasonCodes: ['single_active_document'],
      });
    }
  }
  return results;
}

function scoreTasks(input: TurnUnderstandingInput) {
  const activeId = input.controlState?.activeTaskId;
  const normalizedMessage = normalize(input.message);
  return (input.activeTasks ?? []).map((task) => {
    const reasons: string[] = [];
    let score = 0;
    if (task.taskId === activeId) {
      score += CANDIDATE_WEIGHTS.activeTask;
      reasons.push('active_task');
    } else {
      score += CANDIDATE_WEIGHTS.recentRelatedTask;
      reasons.push('recent_related_task');
    }
    const goalTerms = new Set(normalize(task.goal).split(' ').filter((term) => term.length >= 4));
    const overlap = normalizedMessage.split(' ').filter((term) => goalTerms.has(term)).length;
    if (overlap > 0) {
      score += Math.min(0.35, overlap * 0.1);
      reasons.push('task_goal_overlap');
    }
    if (task.documentIds.some((id) => input.controlState?.activeDocumentIds.includes(id))) {
      score += CANDIDATE_WEIGHTS.activeDocument;
      reasons.push('active_document');
    }
    return { taskId: task.taskId, score: clampConfidence(score), reasonCodes: reasons };
  }).sort((a, b) => b.score - a.score);
}

export function resolveReferents(input: TurnUnderstandingInput) {
  const focusRevision = input.controlState?.focusRevision ?? 0;
  const recentAssistantTurns = input.recentAssistantTurns ?? [];
  const liveOptions = [
    ...(input.controlState?.pendingOptions ?? []),
    ...(recentAssistantTurns[recentAssistantTurns.length - 1]?.pendingOptions ?? []),
  ].filter((item, index, values) => values.findIndex((candidate) => candidate.optionId === item.optionId) === index);
  const optionCandidates = liveOptions
    .map((option) => ({ option, ...optionScore(input.message, option, focusRevision) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);
  const top = optionCandidates[0];
  const second = optionCandidates[1];
  const optionResolved = Boolean(top && top.score >= AUTO_RESOLVE_THRESHOLD && top.score - (second?.score ?? 0) >= AUTO_RESOLVE_MARGIN);

  const referents = documentReferents(input);
  if (optionResolved && top) {
    referents.unshift({
      text: input.message,
      resolvedType: 'option',
      resolvedId: top.option.optionId,
      confidence: clampConfidence(top.score),
      reasonCodes: top.reasons,
    });
  } else if (optionCandidates.length > 1) {
    referents.unshift(...optionCandidates.slice(0, 3).map((candidate) => ({
      text: input.message,
      resolvedType: 'option' as const,
      resolvedId: candidate.option.optionId,
      confidence: clampConfidence(candidate.score),
      reasonCodes: [...candidate.reasons, 'ambiguous_option_candidate'],
    })));
  }

  const normalized = normalize(input.message);
  const unresolvedFragment = REFERENTIAL_FRAGMENT.test(normalized) && referents.length === 0;
  return {
    referents,
    taskCandidates: scoreTasks(input),
    unresolvedFragment,
    optionCandidates: optionCandidates.map(({ option, score, reasons }) => ({
      optionId: option.optionId,
      taskId: option.targetTaskId,
      score: clampConfidence(score),
      reasonCodes: reasons,
    })),
  };
}

export function bestTaskCandidate(tasks: ConversationTaskSnapshot[], activeTaskId?: string) {
  return tasks.find((task) => task.taskId === activeTaskId) ?? tasks.find((task) => task.status === 'active') ?? tasks[0];
}
