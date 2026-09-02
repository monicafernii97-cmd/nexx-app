import type {
  ConversationControlSnapshot,
  ConversationTaskKind,
  ConversationTaskSnapshot,
  FocusTransition,
  ProvisionalTask,
  TurnUnderstanding,
} from './types';

function normalizeGoal(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 1_500);
}

export function createTaskId(seed: string, focusRevision: number) {
  let hash = 2166136261;
  for (const character of `${seed}:${focusRevision}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `task_${(hash >>> 0).toString(36)}_${focusRevision + 1}`;
}

function inferTaskKind(message: string, hasDocuments: boolean): ConversationTaskKind {
  if (/\b(?:draft|write|compose|rewrite)\b/i.test(message)) return 'draft';
  if (/\b(?:procedure|file|filing|court clerk|serve|service)\b/i.test(message) && !hasDocuments) return 'procedure';
  if (/\b(?:strategy|approach|prepare|hearing)\b/i.test(message)) return 'strategy';
  if (hasDocuments && /\b(?:what|which|when|where|why|how|does|is|can|explain|quote)\b/i.test(message)) return 'document_question';
  if (hasDocuments) return 'document_review';
  if (/\b(?:order|legal|court|rights?|duties|possession|custody)\b/i.test(message)) return 'legal_question';
  return 'general';
}

function provisionalTask(message: string, control: ConversationControlSnapshot | undefined, parentTaskId?: string): ProvisionalTask {
  const documentIds = control?.activeDocumentIds ?? [];
  return {
    taskId: createTaskId(message, control?.focusRevision ?? 0),
    parentTaskId,
    kind: inferTaskKind(message, documentIds.length > 0),
    goal: message.trim().slice(0, 1_500),
    normalizedGoal: normalizeGoal(message),
    documentIds,
  };
}

export function decideFocusTransition(args: {
  message: string;
  understanding: TurnUnderstanding;
  controlState?: ConversationControlSnapshot;
  tasks?: ConversationTaskSnapshot[];
}): FocusTransition {
  const { understanding, controlState } = args;
  const activeTaskId = controlState?.activeTaskId;

  // A document attachment is context, not a task. The first utterance must still
  // establish a task even when it is terse or referential (for example “review it”).
  if (!activeTaskId) {
    return {
      kind: 'replace',
      newTask: provisionalTask(args.message, controlState),
      reasonCodes: ['initial_task', ...understanding.reasonCodes],
    };
  }

  if (understanding.ambiguityMaterial) {
    const candidateIds = Array.from(new Set([
      ...understanding.referents.map((referent) => referent.resolvedId).filter((value): value is string => Boolean(value)),
      ...understanding.candidateTasks.slice(0, 3).map((candidate) => candidate.taskId),
    ]));
    return candidateIds.length > 1 || understanding.reasonCodes.includes('unresolved_referential_fragment')
      ? { kind: 'clarify', candidateIds, reasonCodes: ['material_ambiguity', ...understanding.reasonCodes] }
      : { kind: 'retain', reasonCodes: ['uncertain_preserves_focus', ...understanding.reasonCodes] };
  }

  if (understanding.speechAct === 'cancel') {
    return { kind: 'retain', reasonCodes: ['cancel_does_not_implicitly_replace_focus'] };
  }

  if (understanding.continuity === 'new_task' || understanding.speechAct === 'switch_topic') {
    return {
      kind: 'replace',
      previousTaskId: activeTaskId,
      newTask: provisionalTask(args.message, controlState),
      reasonCodes: ['explicit_new_task'],
    };
  }

  if (activeTaskId && ['select', 'answer', 'confirm', 'continue', 'correct', 'challenge', 'reassess', 'clarify'].includes(understanding.speechAct)) {
    const option = understanding.referents.find((referent) => referent.resolvedType === 'option');
    return {
      kind: 'refine',
      taskId: activeTaskId,
      patch: {
        requestedOperation: understanding.requestedOperation,
        selectedOptionId: option?.resolvedId,
      },
      reasonCodes: ['continuation_refines_active_task', ...understanding.reasonCodes],
    };
  }

  if (activeTaskId && understanding.continuity === 'related_task') {
    return {
      kind: 'branch',
      parentTaskId: activeTaskId,
      newTask: provisionalTask(args.message, controlState, activeTaskId),
      reasonCodes: ['related_deliverable_branches_task'],
    };
  }

  return { kind: 'retain', reasonCodes: ['default_preserve_active_task'] };
}
