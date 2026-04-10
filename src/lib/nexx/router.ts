/**
 * Router — Turn classifier for NEXX chat
 * 
 * Runs before every chat call. Classifies the user's message into one of 9
 * route modes and determines which tools to wire into the response.
 * 
 * Current: Regex heuristics (fast, no API call)
 */

import type { RouteMode, ToolPlan, RouterResult } from '../types';

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
  /\b(this\s+document|this\s+order|what\s+does.*say|interpret|analysis.*file|uploaded)\b/i,
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
  const text = message.toLowerCase();

  // Safety-first: always check escalation first
  if (matchesAny(text, SAFETY_PATTERNS)) {
    return buildResult('safety_escalation');
  }

  // Local procedure — check BEFORE drafting so "how do I file" hits procedure
  if (matchesAny(text, PROCEDURE_PATTERNS)) {
    return buildResult('local_procedure');
  }

  // Court-ready drafting
  if (matchesAny(text, DRAFT_PATTERNS)) {
    return buildResult('court_ready_drafting');
  }

  // Judge lens
  if (matchesAny(text, JUDGE_LENS_PATTERNS)) {
    return buildResult('judge_lens_strategy');
  }

  // Document analysis
  if (matchesAny(text, DOCUMENT_ANALYSIS_PATTERNS)) {
    return buildResult('document_analysis');
  }

  // Pattern analysis
  if (matchesAny(text, PATTERN_ANALYSIS_PATTERNS)) {
    return buildResult('pattern_analysis');
  }

  // Support/grounding
  if (matchesAny(text, SUPPORT_PATTERNS)) {
    return buildResult('support_grounding');
  }

  // Default: check if it's clearly a legal question
  if (/\b(law|legal|statute|code|section|rights?|custody|visitation|child\s+support)\b/i.test(text)) {
    return buildResult('direct_legal_answer');
  }

  // Truly adaptive
  return buildResult('adaptive_chat');
}

// ---------------------------------------------------------------------------
// Tool Plan Builder
// ---------------------------------------------------------------------------

function buildToolPlan(mode: RouteMode): ToolPlan {
  return {
    useFileSearch: ['document_analysis', 'court_ready_drafting', 'judge_lens_strategy', 'pattern_analysis'].includes(mode),
    useWebSearch: ['local_procedure', 'direct_legal_answer'].includes(mode),
    useCodeInterpreter: ['pattern_analysis', 'document_analysis'].includes(mode),
    useLocalCourtRetriever: ['local_procedure', 'direct_legal_answer', 'court_ready_drafting'].includes(mode),
    needsClarification: false, // Set by the model if needed
  };
}

function buildResult(mode: RouteMode): RouterResult {
  return {
    mode,
    toolPlan: buildToolPlan(mode),
    temperature: MODE_TEMPERATURES[mode],
  };
}
