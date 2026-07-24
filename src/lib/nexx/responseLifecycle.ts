import type { RouteMode } from '../types';

export type ResponseReasoningEffort = 'medium' | 'high';
export type ResponseVerbosity = 'medium' | 'high';

export type ResponseLifecyclePolicy = {
  preserveProviderProse: boolean;
  usePlainTextTransport: boolean;
  applyDeterministicLitigationRenderer: boolean;
  applyDeterministicLegalEnrichment: boolean;
  applyRenderedLegalVerifier: boolean;
  reasoningEffort: ResponseReasoningEffort;
  verbosity: ResponseVerbosity;
};

const NATURAL_RELATIONAL_ROUTES = new Set<RouteMode>([
  'adaptive_chat',
  'party_message_draft',
  'supportive_strategy',
  'co_parent_response',
  'documentation_strategy',
  'deescalation_response',
  'judge_lens_strategy',
  'pattern_analysis',
  'support_grounding',
  'safety_escalation',
]);

/**
 * These modes are explicit procedural-planning requests. A user-facing draft
 * or relational analysis is intentionally not in this set: deterministic
 * navigation must never replace the provider's actual answer to those turns.
 */
const EXPLICIT_DETERMINISTIC_LITIGATION_ROUTES = new Set<RouteMode>([
  'packed_case_intake',
  'litigation_navigation',
  'court_response_planning',
  'pro_se_guidance',
  'attorney_resource_guidance',
  'filing_walkthrough',
]);

const SUBSTANTIVE_LEGAL_ROUTES = new Set<RouteMode>([
  'direct_legal_answer',
  'local_procedure',
  'document_analysis',
  'order_interpretation',
  'possession_access_schedule',
  'packed_case_intake',
  'litigation_navigation',
  'court_response_planning',
  'pro_se_guidance',
  'attorney_resource_guidance',
  'court_narrative_builder',
  'filing_walkthrough',
  'court_ready_drafting',
]);

const INHERENTLY_HIGH_COMPLEXITY_ROUTES = new Set<RouteMode>([
  'document_analysis',
  'order_interpretation',
  'possession_access_schedule',
  'packed_case_intake',
  'litigation_navigation',
  'court_response_planning',
  'pro_se_guidance',
  'attorney_resource_guidance',
  'court_narrative_builder',
  'filing_walkthrough',
  'judge_lens_strategy',
  'court_ready_drafting',
  'pattern_analysis',
  'safety_escalation',
]);

const HIGH_VERBOSITY_ROUTES = new Set<RouteMode>([
  'document_analysis',
  'order_interpretation',
  'packed_case_intake',
  'litigation_navigation',
  'court_response_planning',
  'court_narrative_builder',
  'judge_lens_strategy',
  'court_ready_drafting',
  'pattern_analysis',
]);

export function isNaturalRelationalRoute(routeMode: RouteMode) {
  return NATURAL_RELATIONAL_ROUTES.has(routeMode);
}

export function isExplicitDeterministicLitigationRoute(routeMode: RouteMode) {
  return EXPLICIT_DETERMINISTIC_LITIGATION_ROUTES.has(routeMode);
}

const GENERAL_STORED_DOCUMENT_REQUEST =
  /\b(?:use|using|review|check|read|reference|quote|verify|compare|according\s+to|based\s+on|from)\b.{0,120}\b(?:(?:my|our|the|saved|stored|uploaded|attached|prior|previous)\s+)?(?:court\s+)?(?:order|document|file|pdf)\b|\b(?:my|our|saved|stored|uploaded|attached|prior|previous)\s+(?:court\s+)?(?:order|document|file|pdf)\b.{0,120}\b(?:say|state|require|allow|provide|control|apply|mean)\b/i;

const EXPLICIT_PRIOR_UPLOAD_REQUEST =
  /\b(?:can|could|would|will)\s+you\b.{0,120}\b(?:use|review|check|read|reference|quote|verify|compare)\b.{0,120}\b(?:my|our|the)\s+(?:saved|stored|uploaded|attached|prior|previous)\s+(?:court\s+)?(?:order|document|file|pdf)\b|\b(?:please\s+)?(?:use|using|review|check|read|reference|quote|verify|compare)\b.{0,100}\b(?:my|our|the)\s+(?:saved|stored|uploaded|attached|prior|previous)\s+(?:court\s+)?(?:order|document|file|pdf)\b/i;

const DIRECT_PERSONAL_DOCUMENT_REQUEST =
  /^(?:(?:can|could|would|will)\s+you\s+|please\s+|use\s+|using\s+).{0,140}\b(?:my|our)\s+(?:court\s+)?(?:order|document|file|pdf)\b/i;

const PASTED_TRANSCRIPT_MARKER =
  /(?:^|\n)[ \t]*(?:\d{1,2}\/\d{1,2}\/\d{2,4}[ \t]*$|AppClose Records Export\b|Generated:[ \t]*\d|(?:Mother|Father|Parent(?:\s+(?:One|Two|[AB]))?|Me|Chat)[ \t]*:|(?!(?:Instructions?|Request|Task|Goal|Prompt|Here\s+is\s+what\s+I\s+need|What\s+I\s+need)[ \t]*:)[\p{L}][\p{L} .'-]{1,60}[ \t]*:[ \t]+\S[^\r\n]*|[\p{L}][\p{L} .'-]{1,60}\s+on\s+\d{1,2}\/\d{1,2}\/\d{2,4}\b)/imu;

function topLevelRequestFraming(message: string) {
  const marker = PASTED_TRANSCRIPT_MARKER.exec(message);
  if (marker) {
    return message.slice(0, marker.index).trim().slice(0, 1_800);
  }
  return message.trim().slice(0, 800);
}

/**
 * Decide whether this turn itself asks NEXX to use a previously stored
 * document. Long pasted conversations are untrusted quoted material for this
 * purpose: a co-parent saying "read the court order" inside the transcript
 * must not repin an old order to the user's relational-analysis request.
 */
export function explicitlyRequestsStoredDocumentForTurn(args: {
  message: string;
  routeMode: RouteMode;
  detectedExplicitPriorUpload?: boolean;
  isDocumentAvailabilityQuestion?: boolean;
}) {
  if (args.isDocumentAvailabilityQuestion) return false;

  const message = args.message.trim();
  if (isNaturalRelationalRoute(args.routeMode)) {
    const framing = topLevelRequestFraming(message);
    if (!framing) return false;
    const hasTranscriptMarker = PASTED_TRANSCRIPT_MARKER.test(message);
    return hasTranscriptMarker
      ? GENERAL_STORED_DOCUMENT_REQUEST.test(framing)
      : EXPLICIT_PRIOR_UPLOAD_REQUEST.test(framing) ||
          DIRECT_PERSONAL_DOCUMENT_REQUEST.test(framing);
  }

  return args.detectedExplicitPriorUpload === true ||
    GENERAL_STORED_DOCUMENT_REQUEST.test(message);
}

export function shouldApplyDeterministicLitigationRenderer(routeMode: RouteMode) {
  return isExplicitDeterministicLitigationRoute(routeMode);
}

export function shouldApplyDeterministicLegalEnrichment(routeMode: RouteMode) {
  return SUBSTANTIVE_LEGAL_ROUTES.has(routeMode);
}

export function shouldApplyRenderedLegalVerifier(routeMode: RouteMode) {
  return SUBSTANTIVE_LEGAL_ROUTES.has(routeMode);
}

/**
 * Relational answers need enough reasoning to synthesize the user's lived
 * context. Complex pattern/judge/safety work and substantive legal work use
 * high effort; no route is blanket-downgraded to low effort.
 */
export function responseReasoningEffort(
  routeMode: RouteMode,
  options: { highComplexity?: boolean } = {},
): ResponseReasoningEffort {
  if (options.highComplexity || INHERENTLY_HIGH_COMPLEXITY_ROUTES.has(routeMode)) {
    return 'high';
  }
  return 'medium';
}

export function responseVerbosity(
  routeMode: RouteMode,
  options: { highComplexity?: boolean } = {},
): ResponseVerbosity {
  if (options.highComplexity || HIGH_VERBOSITY_ROUTES.has(routeMode)) {
    return 'high';
  }
  return 'medium';
}

/**
 * An old document in case memory is not consent to make every later turn a
 * document-grounded legal answer. Relational modes require an explicit
 * current-turn request to use that document, even when quoted transcript text
 * happens to mention an order.
 */
export function shouldForceStoredDocumentGrounding(args: {
  routeMode: RouteMode;
  hasStoredDocument: boolean;
  currentTurnReferencesDocument?: boolean;
  currentTurnExplicitlyRequestsStoredDocument?: boolean;
  isActiveDocumentFollowUp?: boolean;
}) {
  if (!args.hasStoredDocument) return false;

  if (isNaturalRelationalRoute(args.routeMode)) {
    return args.currentTurnExplicitlyRequestsStoredDocument === true;
  }

  if (
    args.routeMode === 'document_analysis' ||
    args.routeMode === 'order_interpretation' ||
    args.routeMode === 'possession_access_schedule'
  ) {
    return Boolean(
      args.currentTurnExplicitlyRequestsStoredDocument ||
      args.currentTurnReferencesDocument ||
      args.isActiveDocumentFollowUp,
    );
  }

  return args.currentTurnExplicitlyRequestsStoredDocument === true;
}

export function responseLifecyclePolicy(
  routeMode: RouteMode,
  options: { highComplexity?: boolean } = {},
): ResponseLifecyclePolicy {
  const preserveProviderProse = isNaturalRelationalRoute(routeMode);

  return {
    preserveProviderProse,
    usePlainTextTransport: preserveProviderProse,
    applyDeterministicLitigationRenderer:
      shouldApplyDeterministicLitigationRenderer(routeMode),
    applyDeterministicLegalEnrichment:
      shouldApplyDeterministicLegalEnrichment(routeMode),
    applyRenderedLegalVerifier:
      shouldApplyRenderedLegalVerifier(routeMode),
    reasoningEffort: responseReasoningEffort(routeMode, options),
    verbosity: responseVerbosity(routeMode, options),
  };
}
