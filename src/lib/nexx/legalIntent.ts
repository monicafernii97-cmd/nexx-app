import type { LegalIntent } from '../types';
import { classifyPackedCaseIntake } from './legal-engine/packedCaseIntake';

const POSSESSION_HOLIDAY_PATTERN =
  /\b(father'?s day|mother'?s day|thanksgiving|christmas|spring break|juneteenth|federal holiday|state holiday|local holiday|friday holiday|summer months|school not in session|summer possession|extended summer|holiday possession|holiday schedule|student holiday|teacher in-service|weekend possession|thursday|friday|saturday|sunday)\b/i;

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

const COURT_RESPONSE_PLANNING_PATTERN =
  /\b(what\s+(?:do|should)\s+i\s+file\s+(?:in\s+)?response|what\s+do\s+i\s+need\s+to\s+file\s+next|how\s+do\s+i\s+(?:answer|respond)\s+(?:(?:to|against)\s+)?(?:his|her|the)?\s*(?:motion|petition)|response\s+to\s+(?:the\s+)?(?:motion|petition)|what\s+court\s+response|file\s+next\s+after\s+being\s+served|what\s+response\s+do\s+i\s+need\s+to\s+file)\b/i;

const PROCEDURE_PATTERN =
  /\b(how do i file|where do i file|filing process|procedure|local rule|standing order|clerk|court forms?|service rules?)\b/i;

const EVIDENCE_STRATEGY_PATTERN =
  /\b(evidence|proof|exhibit|show the court|judge|strategy|argument|counterargument|enforcement risk|contempt)\b/i;

const EMOTIONAL_LEGAL_SUPPORT_PATTERN =
  /\b(freaking out|scared|afraid|anxious|confused|overwhelmed|don'?t know what to do|panicking|stressed|upset)\b/i;

const PRESSURE_MANIPULATION_PATTERN =
  /\b(pressuring|threatening|twisting|manipulating|won'?t stop|keeps saying|accusing|gaslight|lying|bullying|harassing|calling me controlling|withholding)\b/i;

const RESPONSE_STRATEGY_PATTERN =
  /\b(what should i say|what do i say|what should i respond|what do i respond|how do i respond|respond back|reply back|message him|message her|text back|help me respond|can you write back|(?:appclose|ourfamilywizard)\s+(?:response|reply|message))\b/i;

const DOCUMENTATION_PATTERN =
  /\b(should i document|document this|save this|record this|make a timeline|timeline this|court record)\b/i;

const COURT_THREAT_ONLY_PATTERN =
  /\b(taking me to court|take me (?:back )?to court|threaten(?:ed|ing)? to file|says? (?:he|she|they) (?:is|are|will|would) (?:taking|take) me to court)\b/i;

const COURT_FILING_RECEIVED_PATTERN =
  /\b(got served|served me|filed something|filed (?:a|the) (?:motion|petition|enforcement|modification)|(?:motion|petition) (?:against me|was filed)|hearing|court date|lied in the motion)\b/i;

const PRO_SE_PATTERN =
  /\b(pro se|can i do this myself|without (?:a|an) attorney|can'?t afford (?:a|an) attorney|cannot afford (?:a|an) attorney|no money for (?:a|an) attorney)\b/i;

const COST_PATTERN =
  /\b(how much|cost|filing fee|service fee|attorney fee|retainer|lawyer cost|attorney cost)\b/i;

const LEGAL_AID_PATTERN =
  /\b(legal aid|free lawyer|law library|lawyer referral|limited[-\s]?scope|resources)\b/i;

const JUDGE_EXPLANATION_PATTERN =
  /\b(how do i explain|tell the judge|show the judge|what do i say in court|explain myself to the judge)\b/i;

const FILING_WALKTHROUGH_PATTERN =
  /\b(what do i file|what should i file|how do i file|filing walkthrough|file next)\b/i;

export function classifyLegalIntent(message: string): LegalIntent {
  if (COURT_FILING_PATTERN.test(message)) return 'court_filing_draft';

  const multiIntent = classifyPackedCaseIntake(message);
  if (multiIntent.primaryIntent === 'court_response_deadline') return 'court_response_deadline';
  const hasPackedContextBeyondCourtResponse = multiIntent.secondaryIntents.some((intent) => ![
    'new_court_filing_received',
    'court_response_deadline',
    'court_response_planning',
  ].includes(intent));
  if (
    multiIntent.primaryIntent === 'packed_case_intake' &&
    hasPackedContextBeyondCourtResponse
  ) {
    return 'packed_case_intake';
  }
  if (COURT_RESPONSE_PLANNING_PATTERN.test(message)) return 'court_response_planning';
  if (
    multiIntent.primaryIntent === 'packed_case_intake' ||
    multiIntent.secondaryIntents.length >= 3
  ) {
    return 'packed_case_intake';
  }

  if (FILING_WALKTHROUGH_PATTERN.test(message)) return 'filing_walkthrough';
  if (COURT_THREAT_ONLY_PATTERN.test(message) && !COURT_FILING_RECEIVED_PATTERN.test(message)) {
    return 'pressure_or_manipulation_response';
  }
  if (COURT_FILING_RECEIVED_PATTERN.test(message)) return 'new_court_filing_received';
  if (PRO_SE_PATTERN.test(message)) return 'pro_se_feasibility';
  if (COST_PATTERN.test(message)) return 'attorney_cost_question';
  if (LEGAL_AID_PATTERN.test(message)) return 'legal_aid_resource_request';
  if (JUDGE_EXPLANATION_PATTERN.test(message)) return 'judge_explanation_strategy';
  if (RESPONSE_STRATEGY_PATTERN.test(message)) return 'co_parent_response_strategy';
  if (PRESSURE_MANIPULATION_PATTERN.test(message)) return 'pressure_or_manipulation_response';
  if (DOCUMENTATION_PATTERN.test(message)) return 'documentation_guidance';
  if (EMOTIONAL_LEGAL_SUPPORT_PATTERN.test(message)) return 'emotional_legal_support';

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
