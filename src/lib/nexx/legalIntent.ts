import type { LegalIntent } from '../types';

const POSSESSION_HOLIDAY_PATTERN =
  /\b(father'?s day|mother'?s day|thanksgiving|christmas|spring break|summer possession|extended summer|holiday possession|holiday schedule|student holiday|teacher in-service|weekend possession|thursday|friday|saturday|sunday)\b/i;

const POSSESSION_CONTEXT_PATTERN =
  /\b(possession|access|visitation|schedule|start|starts|begin|begins|end|ends|pickup|pick up|drop[-\s]?off|exchange|weekend|clause|provision|paragraph|period)\b/i;

const DIRECT_ORDER_INTERPRETATION_PATTERN =
  /\b((?:what does|does|did)\s+(?:the|this|that|my|our)\s+order|according to (?:the|this|that|my|our)\s+order|under (?:the|this|that|my|our)\s+order|based on (?:the|this|that|my|our)\s+order|what does (?:it|this|that) mean|which clause controls|conflicting clauses?|clause conflict|overlap(?:ping)? provisions?|specific provision|general provision|shall or may)\b/i;

const RIGHTS_OBLIGATIONS_PATTERN =
  /\b(rights?|obligations?|dut(?:y|ies)|permission|authority|decision[-\s]?making|must|shall|required|allowed|prohibited)\b/i;

const DEADLINE_TIMING_PATTERN =
  /\b(deadlines?|due dates?|what day|what date|how long|within \d+|within (?:one|two|three|four|five|six|seven|eight|nine|ten|fourteen|thirty)|no later than|calendar days?|business days?|monthly|recurring|starts?|begins?|ends?)\b/i;

const PARTY_MESSAGE_PATTERN =
  /\b(draft|write|create|respond|reply|message|text|send)\b.{0,100}\b(appclose|co[-\s]?parent|other parent|father|mother|mom|dad|conservator|respondent|petitioner)\b/i;

const COURT_FILING_PATTERN =
  /\b(draft|prepare|generate|write|create)\b.{0,100}\b(motion|petition|declaration|pleading|notice|proposed order|certificate|filing|court[-\s]?ready|affidavit|exhibit list)\b/i;

const PROCEDURE_PATTERN =
  /\b(how do i file|where do i file|filing process|procedure|local rule|standing order|clerk|court forms?|service rules?)\b/i;

const EVIDENCE_STRATEGY_PATTERN =
  /\b(evidence|proof|exhibit|show the court|judge|strategy|argument|counterargument|enforcement risk|contempt)\b/i;

export function classifyLegalIntent(message: string): LegalIntent {
  if (COURT_FILING_PATTERN.test(message)) return 'court_filing_draft';
  if (PARTY_MESSAGE_PATTERN.test(message)) return 'draft_response_to_other_party';

  const asksPossessionTiming =
    POSSESSION_HOLIDAY_PATTERN.test(message) &&
    POSSESSION_CONTEXT_PATTERN.test(message);
  if (asksPossessionTiming) return 'possession_access_schedule';

  if (PROCEDURE_PATTERN.test(message)) return 'procedure_question';
  if (EVIDENCE_STRATEGY_PATTERN.test(message)) return 'evidence_strategy';
  if (DIRECT_ORDER_INTERPRETATION_PATTERN.test(message)) return 'direct_order_interpretation';
  if (RIGHTS_OBLIGATIONS_PATTERN.test(message)) return 'rights_obligations_question';
  if (DEADLINE_TIMING_PATTERN.test(message)) return 'deadline_or_timing_question';

  return 'general_summary';
}
