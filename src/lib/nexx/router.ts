/**
 * Router — Turn classifier for NEXX chat
 * 
 * Runs before every chat call. Classifies the user's message into one of 9
 * route modes and determines which tools to wire into the response.
 * 
 * Current: Regex heuristics (fast, no API call)
 */

import type { FollowUpIntent, LegalIntent, RouteMode, ToolPlan, RouterResult } from '../types';
import { detectDocumentReference, type DocumentReferenceDetection } from './documentReferenceDetection';
import { classifyLegalIntent } from './legalIntent';
import { classifyPackedCaseIntake } from './legal-engine/packedCaseIntake';
import { hasConversationalContinuationSignal } from './legal-engine/legalSignals';

// ---------------------------------------------------------------------------
// Keyword/pattern maps for Phase 1 heuristic classification
// ---------------------------------------------------------------------------

const SAFETY_PATTERNS = [
  /\b(danger|unsafe|emergency|911|violence|harm|hurt)\b/i,
  /\b(threaten(?:ed|ing)?|said|says?)\b.{0,60}\b(kill|hurt|harm|hit|shoot|stab|come after|take the child|kidnap)\b/i,
  /\b(stalking|strangulation|strangled|choked|weapon|gun|knife|kidnapp?ing|refus(?:e|ing|ed) to return (?:the )?child|suicidal|suicide|child left unsafe|physical assault|sexual abuse|immediate flight risk|emergency protective order)\b/i,
  /\b(call.*police|safety plan)\b/i,
  // 'protective order' / 'restraining order' only trigger safety when paired
  // with imminent-risk words — otherwise they route to local_procedure
  /\b(danger|emergency|threaten(?:ed|ing)? (?:to )?(?:hurt|harm|kill)|harm|hurt|violence|weapon|stalking).{0,40}(protective order|restraining order)/i,
  /\b(protective order|restraining order).{0,40}(danger|emergency|threaten(?:ed|ing)? (?:to )?(?:hurt|harm|kill)|harm|hurt|violence|weapon|stalking)/i,
];

const DRAFT_PATTERNS = [
  /\b(draft|write|motion|petition|declaration|pleading|template)\b/i,
  /\b(court[-\s]?ready|filing|submit.*court)\b/i,
];

const EXPLICIT_DRAFT_PATTERNS = [
  /\b(draft|prepare|generate)\b.{0,80}\b(motion|petition|declaration|pleading|notice|proposed\s+order|response|certificate|filing|draft)\b/i,
  /\b(write|create)\b.{0,80}\b(motion|petition|declaration|pleading|response|certificate|filing|draft)\b/i,
  /\b(court[-\s]?ready|filing-ready)\b.{0,80}\b(motion|petition|declaration|pleading|notice|proposed\s+order|response|certificate|draft)\b/i,
];

const JUDGE_LENS_PATTERNS = [
  /\b(judge|court.*see|how.*look|credib|neutral|perception)\b/i,
  /\b(judge.*think|court.*view|magistrate)\b/i,
];

const PROCEDURE_PATTERNS = [
  /\b(how\s+do\s+i|procedure|process|step|file.*in|deadline)\b/i,
  /\b(local.*rule|standing.*order|county.*court)\b/i,
];

const PATTERN_ANALYSIS_PATTERNS = [
  /\b(pattern|always|every\s+time|keeps?\s+doing|repeated|history|trend)\b/i,
];

const DOCUMENT_ANALYSIS_PATTERNS = [
  /\b(this\s+document|this\s+order|what\s+does\s+(this|that|the)\s+(document|order|file|pdf)\s+say|interpret\s+(this|that|the)\s+(document|order|file|pdf)|analysis.*file|uploaded)\b/i,
  /\b(court\s+order|uploaded\s+(document|file|pdf)|attached\s+(document|file|pdf)|shared\s+(document|file|pdf))\b/i,
];

const SUPPORT_PATTERNS = [
  /\b(scared|overwhelmed|can't\s+do\s+this|afraid|anxious|stressed|exhausted)\b/i,
  /\b(help\s+me|don'?t\s+know\s+what\s+to\s+do)\b/i,
  /\bfeeling?\s+(scared|overwhelmed|afraid|anxious|stressed|lost|hopeless)\b/i,
];

const ACTIVE_DOCUMENT_FOLLOW_UP_PATTERN =
  /\b(can|could|should|does|did|is|are|must|shall|allowed|right|mean|means|wrong|okay|ok|do that|say back|respond)\b/i;

const SAME_ISSUE_WHAT_TO_SAY_PATTERN =
  /\b(what\s+(?:do|should)\s+i\s+say(?:\s+back)?|how\s+(?:do|should)\s+i\s+(?:respond|reply)|say\s+back|respond\s+back|reply\s+back)\b/i;

const SAME_ISSUE_NEXT_STEP_PATTERN =
  /\b(what\s+(?:do|should)\s+i\s+do\s+next|next\s+step|what\s+now|how\s+do\s+i\s+handle\s+this)\b/i;

const SAME_ISSUE_RIGHTS_CHECK_PATTERN =
  /\b(is\s+that\s+allowed|am\s+i\s+wrong|is\s+that\s+(?:okay|ok)|do\s+i\s+have\s+(?:the\s+)?right|can\s+i\s+stop\s+(?:him|her|them)|does\s+that\s+mean\s+(?:he|she|they)\s+gets?)\b/i;

const SAME_ISSUE_YES_NO_PATTERN =
  /\b(can|could|should|does|did|is|are|must|shall)\b.{0,80}\b(?:do\s+that|allowed|right|wrong|okay|ok|mean|means|gets?|have\s+to|supposed\s+to|change|take|keep|stop|start|pickup|pick\s+up|exchange)\b/i;

const POSSESSION_FOLLOW_UP_CONTEXT_PATTERN =
  /\b(possession|access|visitation|schedule|father'?s day|mother'?s day|holiday|weekend|pickup|pick up|drop[-\s]?off|exchange|thursday|friday|saturday|sunday)\b/i;

const LEGAL_ACTIVE_CONTEXT_PATTERN =
  /\b(court\s+order|order|possession|access|visitation|custody|conservatorship|decision[-\s]?making|support|enforcement|contempt|other parent|father|mother|appclose|pickup|pick up|drop[-\s]?off|exchange|deadline|obligation|rights?)\b/i;

// ---------------------------------------------------------------------------
// Temperature constants by mode
// ---------------------------------------------------------------------------

const MODE_TEMPERATURES: Record<RouteMode, number> = {
  adaptive_chat: 0.35,
  direct_legal_answer: 0.25,
  local_procedure: 0.2,
  document_analysis: 0.25,
  order_interpretation: 0.2,
  possession_access_schedule: 0.18,
  party_message_draft: 0.25,
  supportive_strategy: 0.3,
  co_parent_response: 0.25,
  documentation_strategy: 0.25,
  deescalation_response: 0.28,
  packed_case_intake: 0.25,
  litigation_navigation: 0.22,
  court_response_planning: 0.2,
  pro_se_guidance: 0.25,
  attorney_resource_guidance: 0.2,
  court_narrative_builder: 0.25,
  filing_walkthrough: 0.2,
  judge_lens_strategy: 0.3,
  court_ready_drafting: 0.2,
  pattern_analysis: 0.3,
  support_grounding: 0.45,
  safety_escalation: 0.2,
};

// ---------------------------------------------------------------------------
// Classify function
// ---------------------------------------------------------------------------

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function isDocumentRoute(mode?: RouteMode) {
  return mode === 'document_analysis' ||
    mode === 'order_interpretation' ||
    mode === 'possession_access_schedule';
}

function isLitigationNavigationRoute(mode?: RouteMode) {
  return mode === 'supportive_strategy' ||
    mode === 'co_parent_response' ||
    mode === 'documentation_strategy' ||
    mode === 'deescalation_response' ||
    mode === 'packed_case_intake' ||
    mode === 'litigation_navigation' ||
    mode === 'court_response_planning' ||
    mode === 'pro_se_guidance' ||
    mode === 'attorney_resource_guidance' ||
    mode === 'court_narrative_builder' ||
    mode === 'filing_walkthrough' ||
    mode === 'court_ready_drafting';
}

export function classifyFollowUpIntent(message: string): FollowUpIntent {
  const text = message.trim();
  if (!text) return 'new_issue';
  if (SAME_ISSUE_WHAT_TO_SAY_PATTERN.test(text)) return 'same_issue_what_to_say';
  if (SAME_ISSUE_NEXT_STEP_PATTERN.test(text)) return 'same_issue_next_step';
  if (SAME_ISSUE_RIGHTS_CHECK_PATTERN.test(text)) return 'same_issue_rights_check';
  if (SAME_ISSUE_YES_NO_PATTERN.test(text)) return 'same_issue_yes_no';
  if (hasConversationalContinuationSignal(text)) return 'same_issue_yes_no';
  return 'new_issue';
}

function hasActiveFamilyLawContext(
  conversationSummary?: string,
  activeMode?: RouteMode,
  hasActiveDocumentContext = false
) {
  return hasActiveDocumentContext ||
    isDocumentRoute(activeMode) ||
    isLitigationNavigationRoute(activeMode) ||
    Boolean(conversationSummary && LEGAL_ACTIVE_CONTEXT_PATTERN.test(conversationSummary));
}

function inferFollowUpRoute(
  message: string,
  conversationSummary?: string,
  activeMode?: RouteMode
): Extract<RouteMode, 'order_interpretation' | 'possession_access_schedule'> {
  if (activeMode === 'possession_access_schedule') return 'possession_access_schedule';
  const contextText = `${message}\n${conversationSummary ?? ''}`;
  return POSSESSION_FOLLOW_UP_CONTEXT_PATTERN.test(contextText)
    ? 'possession_access_schedule'
    : 'order_interpretation';
}

function shouldRouteAsActiveOrderFollowUp(
  legalIntent: LegalIntent,
  followUpIntent: FollowUpIntent,
  hasActiveContext: boolean
) {
  if (!hasActiveContext || followUpIntent === 'new_issue') return false;
  return ![
    'packed_case_intake',
    'new_court_filing_received',
    'court_response_deadline',
    'court_response_planning',
    'filing_walkthrough',
    'pro_se_feasibility',
    'attorney_cost_question',
    'legal_aid_resource_request',
    'judge_explanation_strategy',
    'co_parent_response_strategy',
    'court_filing_draft',
    'draft_response_to_other_party',
  ].includes(legalIntent);
}

function activeDocumentFollowUpReference(_message: string): DocumentReferenceDetection {
  return {
    referencesDocument: true,
    confidence: 'medium',
    referenceType: 'active_document_followup',
    documentHints: [],
    requestedTerms: [],
    requestedSections: [],
    requestedDates: [],
    requestedDocumentTypes: [],
    requiresExactText: false,
    requiresPageOrSectionCitation: false,
    mayNeedClarification: false,
  };
}

function isBareVaguePronounFollowUp(
  documentReference: DocumentReferenceDetection,
  followUpIntent: FollowUpIntent
) {
  return followUpIntent !== 'new_issue' &&
    documentReference.referenceType === 'implicit_followup' &&
    documentReference.documentHints.length === 0 &&
    documentReference.requestedTerms.length === 0 &&
    documentReference.requestedSections.length === 0 &&
    documentReference.requestedDates.length === 0 &&
    documentReference.requestedDocumentTypes.length === 0;
}

/**
 * Classify a user message into a RouteMode.
 * Safety-first: safety_escalation is always checked first.
 */
export function classifyMessage(
  message: string,
  conversationSummary?: string,
  activeMode?: RouteMode,
  hasActiveDocumentContext = false
): RouterResult {
  const text = message.toLowerCase();
  const documentReference = detectDocumentReference(message);
  const legalIntent = classifyLegalIntent(message);
  const multiIntent = classifyPackedCaseIntake(message, conversationSummary);
  const followUpIntent = classifyFollowUpIntent(message);
  const hasActiveContext = hasActiveFamilyLawContext(conversationSummary, activeMode, hasActiveDocumentContext);
  const bareVaguePronounFollowUp = isBareVaguePronounFollowUp(documentReference, followUpIntent);

  // Safety-first: always check escalation first
  if (matchesAny(text, SAFETY_PATTERNS)) {
    return buildResult('safety_escalation', undefined, legalIntent);
  }

  if (legalIntent === 'draft_response_to_other_party') {
    return buildResult('party_message_draft', documentReference, legalIntent);
  }

  if (legalIntent === 'court_response_planning') {
    return buildResult('court_response_planning', documentReference, legalIntent, multiIntent);
  }

  if (legalIntent !== 'court_filing_draft' && (legalIntent === 'packed_case_intake' || multiIntent.secondaryIntents.length >= 3)) {
    return buildResult('packed_case_intake', documentReference, legalIntent, multiIntent);
  }

  if (legalIntent === 'new_court_filing_received' || legalIntent === 'court_response_deadline') {
    return buildResult('litigation_navigation', documentReference, legalIntent, multiIntent);
  }

  if (
    legalIntent === 'co_parent_response_strategy' &&
    followUpIntent === 'same_issue_what_to_say' &&
    hasActiveContext
  ) {
    const activeReference = documentReference.referencesDocument && !bareVaguePronounFollowUp
      ? documentReference
      : activeDocumentFollowUpReference(message);
    return buildResult('co_parent_response', activeReference, legalIntent, multiIntent);
  }

  if (legalIntent === 'filing_walkthrough') {
    return buildResult('filing_walkthrough', documentReference, legalIntent, multiIntent);
  }

  if (legalIntent === 'pro_se_feasibility') {
    return buildResult('pro_se_guidance', documentReference, legalIntent, multiIntent);
  }

  if (legalIntent === 'attorney_cost_question' || legalIntent === 'legal_aid_resource_request') {
    return buildResult('attorney_resource_guidance', documentReference, legalIntent, multiIntent);
  }

  if (legalIntent === 'judge_explanation_strategy') {
    return buildResult('court_narrative_builder', documentReference, legalIntent, multiIntent);
  }

  if (shouldRouteAsActiveOrderFollowUp(legalIntent, followUpIntent, hasActiveContext)) {
    const activeReference = documentReference.referencesDocument && !bareVaguePronounFollowUp
      ? documentReference
      : activeDocumentFollowUpReference(message);
    return buildResult(
      inferFollowUpRoute(message, conversationSummary, activeMode),
      activeReference,
      'direct_order_interpretation'
    );
  }

  if (legalIntent === 'co_parent_response_strategy') {
    return buildResult('co_parent_response', documentReference, legalIntent, multiIntent);
  }

  if (legalIntent === 'pressure_or_manipulation_response') {
    return buildResult('supportive_strategy', documentReference, legalIntent, multiIntent);
  }

  if (legalIntent === 'documentation_guidance') {
    return buildResult('documentation_strategy', documentReference, legalIntent, multiIntent);
  }

  if (legalIntent === 'emotional_legal_support' || legalIntent === 'deescalation_support') {
    return buildResult('supportive_strategy', documentReference, legalIntent, multiIntent);
  }

  if (
    legalIntent === 'general_summary' &&
    followUpIntent !== 'new_issue' &&
    hasActiveContext
  ) {
    const activeReference = documentReference.referencesDocument && !bareVaguePronounFollowUp
      ? documentReference
      : activeDocumentFollowUpReference(message);
    return buildResult(
      inferFollowUpRoute(message, conversationSummary, activeMode),
      activeReference,
      'direct_order_interpretation'
    );
  }

  // Explicit drafting commands should win over document words like "order" so
  // the assistant drafts with document and official-source context available.
  if (matchesAny(text, EXPLICIT_DRAFT_PATTERNS)) {
    return buildResult('court_ready_drafting', documentReference, legalIntent, multiIntent);
  }

  // Document follow-ups should win over generic procedure terms like "deadline".
  if (documentReference.referencesDocument && legalIntent === 'possession_access_schedule') {
    return buildResult('possession_access_schedule', documentReference, legalIntent);
  }

  if (
    documentReference.referencesDocument &&
    (legalIntent === 'direct_order_interpretation' || legalIntent === 'rights_obligations_question')
  ) {
    return buildResult('order_interpretation', documentReference, legalIntent);
  }

  if (
    documentReference.referencesDocument &&
    legalIntent === 'general_summary' &&
    !bareVaguePronounFollowUp &&
    ACTIVE_DOCUMENT_FOLLOW_UP_PATTERN.test(message)
  ) {
    return buildResult('order_interpretation', documentReference, 'direct_order_interpretation');
  }

  if (matchesAny(text, DOCUMENT_ANALYSIS_PATTERNS) || (documentReference.referencesDocument && !bareVaguePronounFollowUp)) {
    return buildResult('document_analysis', documentReference, legalIntent);
  }

  // Local procedure — check BEFORE drafting so "how do I file" hits procedure
  if (matchesAny(text, PROCEDURE_PATTERNS)) {
    return buildResult('local_procedure', undefined, legalIntent);
  }

  // Court-ready drafting
  if (matchesAny(text, DRAFT_PATTERNS)) {
    return buildResult('court_ready_drafting', undefined, legalIntent, multiIntent);
  }

  // Judge lens
  if (matchesAny(text, JUDGE_LENS_PATTERNS)) {
    return buildResult('judge_lens_strategy', undefined, legalIntent);
  }

  // Document analysis
  if (matchesAny(text, DOCUMENT_ANALYSIS_PATTERNS)) {
    return buildResult('document_analysis', documentReference, legalIntent);
  }

  // Pattern analysis
  if (matchesAny(text, PATTERN_ANALYSIS_PATTERNS)) {
    return buildResult('pattern_analysis', undefined, legalIntent);
  }

  // Support/grounding
  if (matchesAny(text, SUPPORT_PATTERNS)) {
    return buildResult('support_grounding', undefined, legalIntent);
  }

  // Default: check if it's clearly a legal question
  if (/\b(law|legal|statute|code|section|rights?|custody|visitation|possession|access|pickup|pick up|drop[-\s]?off|exchange|child\s+support|support|federal\s+holiday|state\s+holiday|local\s+holiday)\b/i.test(text)) {
    return buildResult('direct_legal_answer', undefined, legalIntent);
  }

  // Truly adaptive
  return buildResult('adaptive_chat', undefined, legalIntent);
}

export function preserveOrUpgradeDocumentRoute(
  classified: RouterResult,
  message: string,
  activeMode?: RouteMode
): RouterResult {
  if (classified.mode === 'safety_escalation') return classified;

  const legalIntent = classifyLegalIntent(message);
  const multiIntent = classifyPackedCaseIntake(message);
  const documentReference = classified.documentReference ?? detectDocumentReference(message);
  const followUpIntent = classifyFollowUpIntent(message);
  const bareVaguePronounFollowUp = isBareVaguePronounFollowUp(documentReference, followUpIntent);

  if (
    legalIntent === 'general_summary' &&
    followUpIntent !== 'new_issue'
  ) {
    const activeReference = documentReference.referencesDocument && !bareVaguePronounFollowUp
      ? documentReference
      : activeDocumentFollowUpReference(message);
    return buildResult(
      inferFollowUpRoute(message, undefined, activeMode),
      activeReference,
      'direct_order_interpretation'
    );
  }

  if (legalIntent === 'possession_access_schedule') {
    return buildResult('possession_access_schedule', documentReference, legalIntent);
  }

  if (
    legalIntent === 'direct_order_interpretation' ||
    legalIntent === 'rights_obligations_question'
  ) {
    return buildResult('order_interpretation', documentReference, legalIntent);
  }

  if (legalIntent === 'draft_response_to_other_party') {
    return buildResult('party_message_draft', documentReference, legalIntent);
  }

  if (legalIntent === 'court_response_planning') {
    return buildResult('court_response_planning', documentReference, legalIntent, multiIntent);
  }

  if (legalIntent !== 'court_filing_draft' && (legalIntent === 'packed_case_intake' || multiIntent.secondaryIntents.length >= 3)) {
    return buildResult('packed_case_intake', documentReference, legalIntent, multiIntent);
  }

  if (legalIntent === 'new_court_filing_received' || legalIntent === 'court_response_deadline') {
    return buildResult('litigation_navigation', documentReference, legalIntent, multiIntent);
  }

  if (
    legalIntent === 'co_parent_response_strategy' &&
    followUpIntent === 'same_issue_what_to_say'
  ) {
    const activeReference = documentReference.referencesDocument && !bareVaguePronounFollowUp
      ? documentReference
      : activeDocumentFollowUpReference(message);
    return buildResult('co_parent_response', activeReference, legalIntent, multiIntent);
  }

  if (legalIntent === 'filing_walkthrough') {
    return buildResult('filing_walkthrough', documentReference, legalIntent, multiIntent);
  }

  if (legalIntent === 'pro_se_feasibility') {
    return buildResult('pro_se_guidance', documentReference, legalIntent, multiIntent);
  }

  if (legalIntent === 'attorney_cost_question' || legalIntent === 'legal_aid_resource_request') {
    return buildResult('attorney_resource_guidance', documentReference, legalIntent, multiIntent);
  }

  if (legalIntent === 'judge_explanation_strategy') {
    return buildResult('court_narrative_builder', documentReference, legalIntent, multiIntent);
  }

  if (shouldRouteAsActiveOrderFollowUp(legalIntent, followUpIntent, true)) {
    const activeReference = documentReference.referencesDocument && !bareVaguePronounFollowUp
      ? documentReference
      : activeDocumentFollowUpReference(message);
    return buildResult(
      inferFollowUpRoute(message, undefined, activeMode),
      activeReference,
      'direct_order_interpretation'
    );
  }

  if (legalIntent === 'co_parent_response_strategy') {
    return buildResult('co_parent_response', documentReference, legalIntent, multiIntent);
  }

  if (legalIntent === 'pressure_or_manipulation_response' || legalIntent === 'emotional_legal_support') {
    return buildResult('supportive_strategy', documentReference, legalIntent, multiIntent);
  }

  if (legalIntent === 'documentation_guidance') {
    return buildResult('documentation_strategy', documentReference, legalIntent, multiIntent);
  }

  if (
    documentReference.referencesDocument &&
    legalIntent === 'general_summary' &&
    !bareVaguePronounFollowUp &&
    ACTIVE_DOCUMENT_FOLLOW_UP_PATTERN.test(message)
  ) {
    return buildResult('order_interpretation', documentReference, 'direct_order_interpretation');
  }

  if (classified.mode === 'court_ready_drafting') {
    return buildResult('court_ready_drafting', documentReference, legalIntent, multiIntent);
  }

  if (classified.mode === 'judge_lens_strategy' || classified.mode === 'pattern_analysis') {
    return buildResult(classified.mode, documentReference, legalIntent);
  }

  return buildResult('document_analysis', documentReference, legalIntent);
}

// ---------------------------------------------------------------------------
// Tool Plan Builder
// ---------------------------------------------------------------------------

function buildToolPlan(mode: RouteMode): ToolPlan {
  const documentModes: RouteMode[] = [
    'document_analysis',
    'order_interpretation',
    'possession_access_schedule',
    'co_parent_response',
    'packed_case_intake',
    'litigation_navigation',
    'court_response_planning',
    'court_narrative_builder',
    'filing_walkthrough',
  ];
  const officialResearchModes: RouteMode[] = [
    'local_procedure',
    'direct_legal_answer',
    'order_interpretation',
    'possession_access_schedule',
    'court_ready_drafting',
    'packed_case_intake',
    'litigation_navigation',
    'court_response_planning',
    'pro_se_guidance',
    'attorney_resource_guidance',
    'filing_walkthrough',
  ];

  return {
    useFileSearch: [...documentModes, 'court_ready_drafting', 'judge_lens_strategy', 'pattern_analysis'].includes(mode),
    useWebSearch: [...officialResearchModes, 'document_analysis'].includes(mode),
    useCodeInterpreter: ['pattern_analysis', 'document_analysis', 'packed_case_intake', 'litigation_navigation'].includes(mode),
    useLocalCourtRetriever: officialResearchModes.includes(mode),
    needsClarification: false, // Set by the model if needed
  };
}

function buildResult(
  mode: RouteMode,
  documentReference?: DocumentReferenceDetection,
  legalIntent?: LegalIntent,
  multiIntent?: RouterResult['multiIntent']
): RouterResult {
  const requiresDocumentRetrieval =
    documentReference?.referencesDocument ||
    ['document_analysis', 'order_interpretation', 'possession_access_schedule'].includes(mode) ||
    (isLitigationNavigationRoute(mode) && (
      Boolean(multiIntent?.requiresDocumentReview) ||
      documentReference?.referencesDocument
    )) ||
    undefined;
  const baseToolPlan = buildToolPlan(mode);

  return {
    mode,
    toolPlan: {
      ...baseToolPlan,
      useFileSearch: baseToolPlan.useFileSearch || Boolean(requiresDocumentRetrieval),
    },
    temperature: MODE_TEMPERATURES[mode],
    legalIntent,
    multiIntent,
    documentReference,
    requiresDocumentRetrieval,
    requiresClarification: documentReference?.mayNeedClarification || undefined,
  };
}
