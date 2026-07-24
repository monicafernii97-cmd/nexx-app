/**
 * Router — Turn classifier for NEXX chat
 * 
 * Runs before every chat call. Classifies the user's message into one of 9
 * route modes and determines which tools to wire into the response.
 * 
 * Current: Regex heuristics (fast, no API call)
 */

import type { FollowUpIntent, LegalIntent, RouteMode, ToolPlan, RouterResult } from '../types';
import { detectDocumentReference, isDocumentAvailabilityQuestion, type DocumentReferenceDetection } from './documentReferenceDetection';
import { classifyLegalIntent } from './legalIntent';
import { classifyPackedCaseIntake } from './legal-engine/packedCaseIntake';
import { hasConversationalContinuationSignal } from './legal-engine/legalSignals';

// ---------------------------------------------------------------------------
// Keyword/pattern maps for Phase 1 heuristic classification
// ---------------------------------------------------------------------------

const SAFETY_PATTERNS = [
  /\b(threaten(?:ed|ing)?|said|says?)\b.{0,60}\b(kill|hurt|harm|hit|shoot|stab|come after|take the child|kidnap)\b/i,
  /\b(?:he|she|they|the\s+other\s+parent|my\s+ex)\s+(?:is\s+going\s+to|will|plans?\s+to|intends?\s+to|wants?\s+to)\s+(?:kill|hurt|harm|hit|shoot|stab|come\s+after|take\s+the\s+child|kidnap)\b/i,
  /\b(?:told|texted|wrote\s+to|messaged)\s+(?:me|us)\b.{0,70}\b(?:will|is\s+going\s+to|plans?\s+to|intends?\s+to)\b.{0,25}\b(?:kill|hurt|harm|hit|shoot|stab|come\s+after|take\s+the\s+child|kidnap)\b/i,
  /\b(stalking|strangulation|strangled|choked|weapon|gun|knife|kidnapp?ing|refus(?:e|ing|ed) to return (?:the )?child|suicidal|suicide|child left unsafe|physical assault|sexual abuse|immediate flight risk|emergency protective order)\b/i,
  /\b(call\s+(?:the\s+)?police|call\s+911|need\s+(?:a\s+)?safety plan|help\s+me\s+make\s+(?:a\s+)?safety plan)\b/i,
  /\b(?:i|we|my child|our child|my daughter|my son|the child)\s+(?:am|are|is|feel)\s+(?:in\s+)?(?:immediate\s+)?(?:danger|unsafe)\b/i,
  /\b(?:danger|unsafe|emergency)\s+(?:right\s+now|now|today|tonight|currently|immediately)\b/i,
  // 'protective order' / 'restraining order' only trigger safety when paired
  // with imminent-risk words — otherwise they route to local_procedure
  /\b(danger|emergency|threaten(?:ed|ing)? (?:to )?(?:hurt|harm|kill)|harm|hurt|violence|weapon|stalking).{0,40}(protective order|restraining order)/i,
  /\b(protective order|restraining order).{0,40}(danger|emergency|threaten(?:ed|ing)? (?:to )?(?:hurt|harm|kill)|harm|hurt|violence|weapon|stalking)/i,
];

const HISTORICAL_SAFETY_CONTEXT_PATTERN =
  /\b(?:years?\s+ago|in\s+(?:19|20)\d{2}|when\s+(?:we|i)\s+(?:were|was)\s+together|during\s+our\s+relationship|previously|in\s+the\s+past|used\s+to)\b/i;

const CURRENT_SAFETY_GRAMMAR_PATTERN =
  /\b(?:is|are|am|has\s+been|have\s+been|keeps?|continues?)\s+(?:currently\s+)?(?:stalking|threatening|following|harassing|refusing\s+to\s+return|keeping\s+the\s+child)\b|\b(?:says?|threatens?|told|texted|wrote\s+to|messaged)\b.{0,70}\b(?:will|is\s+going\s+to|plans?\s+to|intends?\s+to|wants?\s+to)\b.{0,25}\b(?:kill|hurt|harm|hit|shoot|stab|come\s+after|take\s+the\s+child|kidnap)\b|\b(?:he|she|they|the\s+other\s+parent|my\s+ex)\s+(?:is\s+going\s+to|will|plans?\s+to|intends?\s+to|wants?\s+to)\s+(?:kill|hurt|harm|hit|shoot|stab|come\s+after|take\s+the\s+child|kidnap)\b|\bis\s+threatening\b.{0,40}\b(?:kill|hurt|harm|hit|shoot|stab|come\s+after|take\s+the\s+child|kidnap)\b|\brefuses?\s+to\s+return\s+(?:the\s+)?child\b/i;

const CURRENT_SAFETY_NEGATION_PATTERN =
  /\b(?:not\s+(?:because\s+)?(?:i|we|my child|our child|my daughter|my son|the child)\s+(?:am|are|is)\s+(?:currently\s+)?(?:in\s+)?(?:danger|unsafe)|not\s+in\s+danger\s+now|no\s+(?:current|immediate)\s+safety\s+concern)\b/i;

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

const CONVERSATION_REVIEW_PATTERNS = [
  /\b(?:review|analy[sz]e|assessment|feedback)\b.{0,100}\b(?:thread|conversation|exchange|multiple\s+messages|message\s+thread|communication\s+history)\b/i,
  /\b(?:thread|conversation|exchange|multiple\s+messages|message\s+thread|communication\s+history)\b.{0,100}\b(?:review|analy[sz]e|assessment|feedback)\b/i,
  /\bwhat\s+do\s+you\s+see\b.{0,80}\b(?:both\s+sides|from\s+(?:his|her|my|each)\s+side|transparently|human)\b/i,
  /\b(?:with|given)\s+(?:that|this)\s+context\b.{0,120}\bwhat\s+do\s+you\s+see\b/i,
  /\bwhat\s+do\s+you\s+see\b.{0,120}\b(?:behavior|words|dynamic|interaction|communication|pattern)\b/i,
  /\b(?:reading|read)\s+this\b.{0,80}\b(?:not\s+as\s+a\s+judge|as\s+a\s+human|from\s+both\s+sides)\b/i,
];

const SINGLE_MESSAGE_REPLY_DRAFT_PATTERN =
  /\b(?:(?:review|analy[sz]e)\b.{0,60}\b(?:this|one|the)\s+message\b.{0,80}\b(?:draft|write|reply|respond)|draft\s+(?:a\s+)?reply|write\s+(?:a\s+)?response)\b/i;

const DOCUMENT_ANALYSIS_PATTERNS = [
  /\b(this\s+document|this\s+order|what\s+does\s+(this|that|the)\s+(document|order|file|pdf)\s+say|interpret\s+(this|that|the)\s+(document|order|file|pdf)|analysis.*file|uploaded)\b/i,
  /\b(court\s+order|uploaded\s+(document|file|pdf)|attached\s+(document|file|pdf)|shared\s+(document|file|pdf))\b/i,
];

const SUPPORT_PATTERNS = [
  /\b(scared|overwhelmed|can't\s+do\s+this|afraid|anxious|stressed|exhausted)\b/i,
  /\b(help\s+me|don'?t\s+know\s+what\s+to\s+do)\b/i,
  /\bfeeling?\s+(scared|overwhelmed|afraid|anxious|stressed|lost|hopeless)\b/i,
];

const RELATIONAL_STRATEGY_PATTERNS = [
  /\b(?:emotionally|emotional)\s+(?:detach|detachment|protect|regulate|process)\b/i,
  /\bwithout\s+becoming\s+(?:cold|hostile|reactive)\b/i,
  /\bprotect\b.{0,40}\b(?:child|daughter|son|kid)\b.{0,40}\bemotionally\b/i,
  /\b(?:psychological|emotional)\s+(?:trap|dynamic|pattern|impact)\b/i,
  /\b(?:nervous\s+system|trauma\s+response|relational\s+dynamic|parallel\s+parenting)\b/i,
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

const SHORT_CONTINUATION_PATTERN =
  /^(?:(?:yes|yeah|yep|okay|ok|sure|right)[,;]?\s+)?(?:please\s+)?(?:yes|yeah|yep|okay|ok|sure|right|go ahead|let'?s do (?:that|it|all(?:\s+\d+)?))(?:[.!])?$/i;

const EXPLANATION_CONTINUATION_PATTERN =
  /\b(?:can|could|would)\s+you\s+(?:explain|expand|elaborate|go\s+deeper|say\s+more)\b|\b(?:tell|show)\s+me\s+more\b|\bwhat\s+do\s+you\s+mean\b|\b(?:can|could|should)\s+we\s+(?:rephrase|rewrite|make|change|shorten|remove|adjust)\b|\bi\s+(?:do\s+not|don'?t)\s+(?:want|need)\s+(?:to\s+)?(?:say|include|add|invite|remind)\b|\bi\s+think\b.{0,100}\bi\s+(?:do\s+not|don'?t)\s+need\b/i;

const NON_DOCUMENT_CONTINUATION_MODES: RouteMode[] = [
  'adaptive_chat',
  'party_message_draft',
  'supportive_strategy',
  'co_parent_response',
  'documentation_strategy',
  'deescalation_response',
  'judge_lens_strategy',
  'pattern_analysis',
  'support_grounding',
];

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

function hasSafetyEscalationSignal(message: string) {
  if (!matchesAny(message, SAFETY_PATTERNS)) return false;

  // Scope historical suppression to the sentence that contains the safety
  // signal. A historical disclosure in one sentence must never suppress a new
  // current-risk report elsewhere in the same turn.
  const safetySegments = message
    .split(/(?<=[.!?;])\s+|\r?\n+|,\s+(?=(?:and|but)\b)|\s+(?:and|but)\s+(?=(?:he|she|they|i|we|now|today|tonight|currently)\b)/i)
    .map((segment) => segment.trim())
    .filter((segment) => matchesAny(segment, SAFETY_PATTERNS));

  return safetySegments.some((segment) => {
    if (CURRENT_SAFETY_NEGATION_PATTERN.test(segment)) return false;
    const isHistorical =
      HISTORICAL_SAFETY_CONTEXT_PATTERN.test(segment) &&
      !CURRENT_SAFETY_GRAMMAR_PATTERN.test(segment);
    return !isHistorical;
  });
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
  if (SHORT_CONTINUATION_PATTERN.test(text) || EXPLANATION_CONTINUATION_PATTERN.test(text)) {
    return 'same_issue_yes_no';
  }
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
  _hasActiveDocumentContext = false
) {
  void _hasActiveDocumentContext;
  return isDocumentRoute(activeMode) ||
    isLitigationNavigationRoute(activeMode) ||
    Boolean(conversationSummary && LEGAL_ACTIVE_CONTEXT_PATTERN.test(conversationSummary));
}

function isNonDocumentContinuationMode(mode?: RouteMode): mode is RouteMode {
  return Boolean(mode && NON_DOCUMENT_CONTINUATION_MODES.includes(mode));
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
  if (followUpIntent === 'same_issue_rights_check') return true;
  return [
    'general_summary',
    'direct_order_interpretation',
    'rights_obligations_question',
    'possession_access_schedule',
    'deadline_or_timing_question',
  ].includes(legalIntent);
}

function activeDocumentFollowUpReference(_message: string): DocumentReferenceDetection {
  void _message;
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
  if (hasSafetyEscalationSignal(message)) {
    return buildResult('safety_escalation', undefined, legalIntent);
  }

  // Storage/availability questions are conversational metadata checks. They
  // must not trigger order analysis, clause extraction, or deadline workflows.
  if (isDocumentAvailabilityQuestion(message)) {
    return buildResult('adaptive_chat', documentReference, 'general_summary');
  }

  if (SINGLE_MESSAGE_REPLY_DRAFT_PATTERN.test(message)) {
    return buildResult('party_message_draft', documentReference, 'draft_response_to_other_party');
  }

  if (legalIntent === 'draft_response_to_other_party') {
    return buildResult('party_message_draft', documentReference, legalIntent);
  }

  // A request to understand a conversation is a whole-thread reasoning task,
  // even when the pasted exchange mentions orders, filings, or many dates.
  if (matchesAny(text, CONVERSATION_REVIEW_PATTERNS)) {
    return buildResult('pattern_analysis', documentReference, legalIntent, multiIntent);
  }

  if (
    matchesAny(text, RELATIONAL_STRATEGY_PATTERNS) &&
    ![
      'court_filing_draft',
      'court_response_planning',
      'filing_walkthrough',
      'pro_se_feasibility',
      'attorney_cost_question',
      'legal_aid_resource_request',
      'procedure_question',
    ].includes(legalIntent)
  ) {
    return buildResult('supportive_strategy', documentReference, legalIntent, multiIntent);
  }

  // Short acknowledgements and requests to elaborate should continue the
  // active relational task instead of being converted into order analysis
  // merely because a document remains attached to the conversation.
  if (
    legalIntent === 'general_summary' &&
    followUpIntent !== 'new_issue' &&
    isNonDocumentContinuationMode(activeMode)
  ) {
    return buildResult(activeMode, documentReference, legalIntent, multiIntent);
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
  if (isDocumentAvailabilityQuestion(message)) return classified;

  const legalIntent = classifyLegalIntent(message);
  const documentReference = classified.documentReference ?? detectDocumentReference(message);
  const followUpIntent = classifyFollowUpIntent(message);
  const bareVaguePronounFollowUp = isBareVaguePronounFollowUp(documentReference, followUpIntent);

  // Classification has already considered the user's request. An attachment
  // should enrich a relational, drafting, procedure, or support route—not
  // replace that route with generic document analysis.
  if (
    !isDocumentRoute(classified.mode) &&
    classified.mode !== 'adaptive_chat' &&
    classified.mode !== 'direct_legal_answer'
  ) {
    return classified;
  }

  if (isDocumentRoute(classified.mode)) return classified;

  const hasExplicitDocumentRequest =
    documentReference.referencesDocument && !bareVaguePronounFollowUp;
  const isActiveDocumentContinuation =
    isDocumentRoute(activeMode) && followUpIntent !== 'new_issue';

  if (!hasExplicitDocumentRequest && !isActiveDocumentContinuation) {
    return classified;
  }

  const activeReference = hasExplicitDocumentRequest
    ? documentReference
    : activeDocumentFollowUpReference(message);

  if (legalIntent === 'possession_access_schedule') {
    return buildResult('possession_access_schedule', activeReference, legalIntent);
  }

  if (
    legalIntent === 'direct_order_interpretation' ||
    legalIntent === 'rights_obligations_question' ||
    (
      isActiveDocumentContinuation &&
      legalIntent === 'general_summary' &&
      ACTIVE_DOCUMENT_FOLLOW_UP_PATTERN.test(message)
    )
  ) {
    return buildResult(
      inferFollowUpRoute(message, undefined, activeMode),
      activeReference,
      'direct_order_interpretation'
    );
  }

  return hasExplicitDocumentRequest
    ? buildResult('document_analysis', activeReference, legalIntent)
    : classified;
}

/** One authoritative route resolver shared by API admission and turn persistence. */
export function resolveTurnRoute(args: {
  message: string;
  conversationSummary?: string;
  activeMode?: RouteMode;
  hasActiveDocumentContext?: boolean;
}) {
  const classified = classifyMessage(
    args.message,
    args.conversationSummary,
    args.activeMode,
    args.hasActiveDocumentContext ?? false
  );

  return args.hasActiveDocumentContext && classified.mode !== 'safety_escalation'
    ? preserveOrUpgradeDocumentRoute(classified, args.message, args.activeMode)
    : classified;
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
