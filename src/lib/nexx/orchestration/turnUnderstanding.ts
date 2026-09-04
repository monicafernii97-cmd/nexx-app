import { hasExplicitNewIssueSignal } from '../legal-engine/legalSignals';
import { isAwaitingUploadTurn } from './documentActivation';
import { ORCHESTRATION_POLICY_VERSION, ORCHESTRATION_POLICY_V2_VERSION, clampConfidence } from './policy';
import { resolveReferents } from './referentResolver';
import type { SpeechAct, TurnUnderstanding, TurnUnderstandingInput } from './types';

const CANCEL = /^(?:stop|cancel|never\s*mind|nevermind|forget\s+it|don't|do\s+not)$/i;
const EXPLICIT_SWITCH = /\b(?:new|different|another|separate)\s+(?:topic|question|issue)|\b(?:switch|change)\s+(?:topics?|subjects?)\b/i;
const CHALLENGE = /\b(?:you(?:'re|\s+are)\s+wrong|that(?:'s|\s+is)\s+wrong|incorrect|not\s+right|look\s+again|recheck|are\s+you\s+sure|why\s+(?:did|do|are|were|would)\s+you|(?:check|audit|inspect|explain)\s+(?:your|the)\s+(?:last|previous|prior)\s+(?:answer|response|turn|behavior)|why\s+(?:is|was|did)\b.{0,80}\b(?:fail|failed|wrong|happen|happened))\b/i;
const CORRECTION = /^(?:no[, ]+|wait[, ]+|actually\b|not\s+that\b|i\s+meant\b|correction\b)/i;
const CONFIRM = /^(?:yes|yeah|yep|correct|right|exactly|okay|ok|sure|please|please\s+do|please\s+do\s+so|do\s+it|that\s+works|sounds\s+good)[.! ]*$/i;
const CONTINUE = /^(?:continue|go\s+on|keep\s+going|more|proceed|carry\s+on|then\s+what)[.! ]*$/i;
const CLARIFY = /^(?:which|what|why|how|huh|what\s+do\s+you\s+mean|which\s+one|what\s+one)[?!. ]*$/i;
const SOCIAL = /^(?:hi|hello|hey|thanks|thank\s+you|got\s+it|k|lol|👍|👌|🙏)[!. ]*$/iu;
const CAPABILITY = /\b(?:can|could|do)\s+you\s+(?:read|access|see|search|review|open)|\bdo\s+you\s+have\s+(?:access|the\s+file)\b|\b(?:did|have)\s+you\s+(?:receive|received|got)\b|\bconfirm\b.{0,50}\b(?:received|uploaded|file|document)\b/i;
const DOCUMENT_OPERATION = /\b(?:analy[sz]e|review|summari[sz]e|quote|search|compare|explain|read)\b.{0,80}\b(?:file|order|document|pdf|page|clause|section)\b|\b(?:file|order|document|pdf|page|clause|section)\b.{0,80}\b(?:analy[sz]e|review|summari[sz]e|quote|search|compare|explain|read)\b/i;
const OPAQUE_TERM_QUERY = /^[A-Z][A-Z0-9._-]{1,20}[?!.]?$/;

function normalize(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function inferRequestedOperation(message: string, foregroundIntentV2 = false) {
  if (foregroundIntentV2 && isAwaitingUploadTurn(message)) return 'await_upload';
  if (CAPABILITY.test(message)) return 'document_capability';
  const match = message.match(/\b(analy[sz]e|review|summari[sz]e|quote|search|compare|explain|read|draft|check)\b/i);
  return match?.[1].toLowerCase().replace('analyse', 'analyze').replace('summarise', 'summarize');
}

function inferSpeechAct(message: string, input: TurnUnderstandingInput): SpeechAct {
  if (CANCEL.test(message)) return 'cancel';
  if (EXPLICIT_SWITCH.test(message) || hasExplicitNewIssueSignal(message)) return 'switch_topic';
  if (CHALLENGE.test(message)) return 'challenge';
  if (CORRECTION.test(message)) return 'correct';
  if (CONFIRM.test(message) && (
    input.controlState?.pendingAct === 'confirm' ||
    input.controlState?.pendingAct === 'continue' ||
    input.controlState?.lastAssistantOffer ||
    input.controlState?.pendingOptions.length === 1
  )) return 'confirm';
  if (CONTINUE.test(message)) return 'continue';
  if (CLARIFY.test(message)) return 'clarify';
  if (SOCIAL.test(message)) return 'social';
  if (input.controlState?.pendingAct === 'select') return 'select';
  if (input.controlState?.pendingAct === 'supply_detail') return 'answer';
  if (OPAQUE_TERM_QUERY.test(message)) return 'unknown';
  if (/[?]$/.test(message) || /^(?:what|when|where|why|how|who|can|could|does|do|is|are|should|would)\b/i.test(message)) return 'ask';
  if (DOCUMENT_OPERATION.test(message)) return 'ask';
  return message.split(/\s+/).length <= 3 ? 'unknown' : 'ask';
}

export function understandTurn(input: TurnUnderstandingInput): TurnUnderstanding {
  const message = normalize(input.message);
  const resolved = resolveReferents({ ...input, message });
  let speechAct = inferSpeechAct(message, input);

  if (speechAct === 'select' && resolved.optionCandidates.length === 0) {
    speechAct = resolved.unresolvedFragment ? 'clarify' : 'answer';
  }
  const hasContext = Boolean(input.controlState?.activeTaskId || input.controlState?.activeDocumentIds.length || input.activeTasks?.length);
  const explicitNew = speechAct === 'switch_topic';
  const continuationAct = ['answer', 'select', 'confirm', 'continue', 'clarify', 'correct', 'challenge', 'reassess', 'social'].includes(speechAct);
  const continuity = explicitNew
    ? 'new_task'
    : hasContext && continuationAct
      ? 'same_task'
      : hasContext && resolved.taskCandidates[0]?.score
        ? 'related_task'
        : hasContext
          ? 'uncertain'
          : 'new_task';

  const topTask = resolved.taskCandidates[0];
  const secondTask = resolved.taskCandidates[1];
  const referentConfidence = resolved.referents[0]?.confidence ?? 0;
  const confidence = explicitNew
    ? 1
    : clampConfidence(Math.max(
        referentConfidence,
        topTask?.score ?? 0,
        continuationAct && hasContext ? 0.76 : 0.35,
      ));
  const optionAmbiguous = resolved.optionCandidates.length > 1 &&
    resolved.optionCandidates[0].score - resolved.optionCandidates[1].score < 0.18;
  const taskAmbiguous = Boolean(topTask && secondTask && topTask.score - secondTask.score < 0.18 && topTask.score >= 0.5);
  const confirmationResolved = speechAct === 'confirm' && Boolean(
    input.controlState?.lastAssistantOffer || input.controlState?.pendingOptions.length === 1
  );
  const ambiguityMaterial = !confirmationResolved && (
    resolved.unresolvedFragment || optionAmbiguous || taskAmbiguous || (speechAct === 'unknown' && hasContext)
  );

  const reasonCodes = [
    `speech_act_${speechAct}`,
    `continuity_${continuity}`,
    ...(hasContext ? ['active_context'] : ['no_active_context']),
    ...(resolved.unresolvedFragment ? ['unresolved_referential_fragment'] : []),
    ...(optionAmbiguous ? ['ambiguous_pending_options'] : []),
    ...(taskAmbiguous ? ['ambiguous_tasks'] : []),
    ...(confirmationResolved ? ['confirmation_resolved_by_pending_offer'] : []),
  ];

  return {
    schemaVersion: 1,
    speechAct,
    continuity,
    requestedOperation: inferRequestedOperation(message, input.foregroundIntentV2),
    referents: resolved.referents,
    candidateTasks: resolved.taskCandidates,
    confidence,
    ambiguityMaterial,
    reasonCodes,
    resolverVersion: input.foregroundIntentV2 ? ORCHESTRATION_POLICY_V2_VERSION : ORCHESTRATION_POLICY_VERSION,
  };
}
