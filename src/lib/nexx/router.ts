/**
 * Router — Turn classifier for NEXX chat
 * 
 * Runs before every chat call. Classifies the user's message into one of 9
 * route modes and determines which tools to wire into the response.
 * 
 * Current: Regex heuristics (fast, no API call)
 */

import type { LegalIntent, RouteMode, ToolPlan, RouterResult } from '../types';
import { detectDocumentReference, type DocumentReferenceDetection } from './documentReferenceDetection';
import { classifyLegalIntent } from './legalIntent';

// ---------------------------------------------------------------------------
// Keyword/pattern maps for Phase 1 heuristic classification
// ---------------------------------------------------------------------------

const SAFETY_PATTERNS = [
  /\b(danger|unsafe|emergency|911|violence|threaten|harm|hurt)\b/i,
  /\b(call.*police|safety plan)\b/i,
  // 'protective order' / 'restraining order' only trigger safety when paired
  // with imminent-risk words — otherwise they route to local_procedure
  /\b(danger|emergency|threaten|harm|hurt|violence).{0,40}(protective order|restraining order)/i,
  /\b(protective order|restraining order).{0,40}(danger|emergency|threaten|harm|hurt|violence)/i,
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

/**
 * Classify a user message into a RouteMode.
 * Safety-first: safety_escalation is always checked first.
 */
export function classifyMessage(
  message: string,
  _conversationSummary?: string,
  _activeMode?: RouteMode
): RouterResult {
  void _conversationSummary;
  void _activeMode;

  const text = message.toLowerCase();
  const documentReference = detectDocumentReference(message);
  const legalIntent = classifyLegalIntent(message);

  // Safety-first: always check escalation first
  if (matchesAny(text, SAFETY_PATTERNS)) {
    return buildResult('safety_escalation', undefined, legalIntent);
  }

  if (legalIntent === 'draft_response_to_other_party') {
    return buildResult('party_message_draft', documentReference, legalIntent);
  }

  // Explicit drafting commands should win over document words like "order" so
  // the assistant drafts with document and official-source context available.
  if (matchesAny(text, EXPLICIT_DRAFT_PATTERNS)) {
    return buildResult('court_ready_drafting', documentReference, legalIntent);
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

  if (matchesAny(text, DOCUMENT_ANALYSIS_PATTERNS) || documentReference.referencesDocument) {
    return buildResult('document_analysis', documentReference, legalIntent);
  }

  // Local procedure — check BEFORE drafting so "how do I file" hits procedure
  if (matchesAny(text, PROCEDURE_PATTERNS)) {
    return buildResult('local_procedure', undefined, legalIntent);
  }

  // Court-ready drafting
  if (matchesAny(text, DRAFT_PATTERNS)) {
    return buildResult('court_ready_drafting', undefined, legalIntent);
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
  if (/\b(law|legal|statute|code|section|rights?|custody|visitation|child\s+support|federal\s+holiday|state\s+holiday|local\s+holiday)\b/i.test(text)) {
    return buildResult('direct_legal_answer', undefined, legalIntent);
  }

  // Truly adaptive
  return buildResult('adaptive_chat', undefined, legalIntent);
}

export function preserveOrUpgradeDocumentRoute(classified: RouterResult, message: string): RouterResult {
  if (classified.mode === 'safety_escalation') return classified;

  const legalIntent = classifyLegalIntent(message);
  const documentReference = classified.documentReference ?? detectDocumentReference(message);

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

  if (classified.mode === 'court_ready_drafting') {
    return buildResult('court_ready_drafting', documentReference, legalIntent);
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
  ];
  const officialResearchModes: RouteMode[] = [
    'local_procedure',
    'direct_legal_answer',
    'order_interpretation',
    'possession_access_schedule',
    'court_ready_drafting',
  ];

  return {
    useFileSearch: [...documentModes, 'court_ready_drafting', 'judge_lens_strategy', 'pattern_analysis'].includes(mode),
    useWebSearch: [...officialResearchModes, 'document_analysis'].includes(mode),
    useCodeInterpreter: ['pattern_analysis', 'document_analysis'].includes(mode),
    useLocalCourtRetriever: officialResearchModes.includes(mode),
    needsClarification: false, // Set by the model if needed
  };
}

function buildResult(mode: RouteMode, documentReference?: DocumentReferenceDetection, legalIntent?: LegalIntent): RouterResult {
  const requiresDocumentRetrieval =
    documentReference?.referencesDocument ||
    ['document_analysis', 'order_interpretation', 'possession_access_schedule'].includes(mode) ||
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
    documentReference,
    requiresDocumentRetrieval,
    requiresClarification: documentReference?.mayNeedClarification || undefined,
  };
}
