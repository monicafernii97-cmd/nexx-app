import type { RouteMode } from '../../types';
import type { DocumentActivationDecision } from './documentActivation';
import type { FocusTransition, QuestionKind, TurnExecutionPlan, TurnUnderstanding } from './types';

function fingerprint(value: string) {
  let hash = 5381;
  for (const character of value) hash = ((hash << 5) + hash) ^ character.charCodeAt(0);
  return (hash >>> 0).toString(36);
}

function questionKind(message: string, understanding: TurnUnderstanding): QuestionKind {
  if (understanding.speechAct === 'select') return 'selection';
  if (understanding.speechAct === 'confirm') return 'confirmation';
  if (understanding.speechAct === 'correct' || understanding.speechAct === 'challenge') return 'correction';
  if (understanding.requestedOperation === 'document_capability') return 'capability';
  if (/\b(?:status|ready|finished|done|progress)\b/i.test(message)) return 'status';
  if (/\b(?:mean|explain|interpret)\b/i.test(message)) return 'meaning';
  if (/\b(?:when|date|deadline|schedule|possession|pickup|exchange)\b/i.test(message)) return 'schedule';
  if (/\b(?:draft|write|message|email|text)\b/i.test(message)) return 'communication';
  if (/\b(?:which|either|or)\b/i.test(message)) return 'either_or';
  if (/\b(?:analy[sz]e|review|summari[sz]e)\b/i.test(message)) return 'open_analysis';
  if (/[?]$/.test(message)) return 'yes_no';
  return 'other';
}

export function buildExecutionPlan(args: {
  message: string;
  understanding: TurnUnderstanding;
  transition: FocusTransition;
  taskId: string;
  focusRevision: number;
  routeMode: RouteMode;
  activeDocumentIds: string[];
  attachmentDocumentIds?: string[];
  documentActivation?: DocumentActivationDecision;
}): TurnExecutionPlan {
  const responseAct = args.transition.kind === 'clarify' || args.understanding.ambiguityMaterial
    ? 'clarify'
    : args.understanding.speechAct === 'correct' || args.understanding.speechAct === 'challenge'
      ? 'correct'
    : args.understanding.requestedOperation === 'await_upload'
      ? 'status'
      : args.understanding.speechAct === 'confirm'
        ? 'confirm'
        : 'answer';
  const resolvedDocumentIds = args.understanding.referents
    .filter((referent) => referent.resolvedType === 'document' && referent.resolvedId)
    .map((referent) => referent.resolvedId as string);
  const documentActivation = args.documentActivation ?? {
    active: true,
    useCurrentAttachmentsOnly: false,
  };
  const activatedDocumentIds = documentActivation.useCurrentAttachmentsOnly
    ? args.attachmentDocumentIds ?? []
    : args.activeDocumentIds;
  const selectedDocumentIds = documentActivation.active
    ? Array.from(new Set([...activatedDocumentIds, ...resolvedDocumentIds]))
    : [];
  const requiresDocuments = selectedDocumentIds.length > 0;
  const kind = questionKind(args.message, args.understanding);
  const requiresDocumentText = requiresDocuments && kind !== 'capability';
  return {
    schemaVersion: 1,
    planId: `plan_${fingerprint(`${args.taskId}:${args.focusRevision}:${args.message}`)}`,
    taskId: args.taskId,
    focusRevision: args.focusRevision,
    responseAct,
    routeMode: args.routeMode,
    selectedDocumentIds,
    evidenceRequirements: requiresDocuments
      ? ['authorized_document', ...(requiresDocumentText ? ['relevant_source_unit'] : [])]
      : [],
    retrievalQueries: requiresDocumentText ? [args.message.trim().slice(0, 2_000)] : [],
    capabilityRequirements: requiresDocuments
      ? ['document_metadata', ...(requiresDocumentText ? ['scoped_text_or_chunks'] : [])]
      : [],
    fallbackOrder: ['deterministic_repair', 'rerender', 'single_regeneration', 'scoped_answer', 'clarification', 'safe_limitation'],
    questionKind: kind,
  };
}
