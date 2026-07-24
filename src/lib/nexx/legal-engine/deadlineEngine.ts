import type { RouteMode } from '../../types';
import type { CourtFilingExtraction } from './courtFilingExtractor';

export type DeadlineAnalysis = {
  status: 'not_applicable' | 'needs_inputs' | 'express_date_only' | 'calculation_ready' | 'calculated';
  trigger: string | null;
  serviceMethod: string | null;
  governingRule: string | null;
  jurisdiction: string | null;
  timezone: string | null;
  calendarTreatment: string | null;
  calendarDate: string | null;
  sourcedDates: Array<{
    label: string;
    value: string;
    sourceIds: string[];
    pageStart?: number | null;
    pageEnd?: number | null;
  }>;
  missingInputs: string[];
  explanation: string;
};

const EXPLICIT_DEADLINE_INTENT_PATTERNS = [
  /\b(?:what|when|which)\s+(?:is|are|was|were)?\s*(?:my|the|a)?\s*(?:filing|response|answer|service)?\s*(?:deadline|due date|court date|hearing date)\b/i,
  /\b(?:when|what\s+date)\s+(?:is|are)\s+(?:my|the|a)\s+(?:response|answer|filing)\s+due\b/i,
  /\b(?:when|by\s+what\s+date|what\s+date|how\s+soon)\s+(?:do|should|must|can)\s+i\s+(?:file|respond|answer|serve)\b/i,
  /\bhow\s+(?:long|many\s+(?:calendar|business)?\s*days?)\s+(?:do\s+i\s+have|after\s+(?:being\s+)?served|from\s+(?:service|the\s+hearing))\b/i,
  /\b(?:deadline|due\s+date)\s+(?:for|to)\s+(?:file|respond|answer|serve)\b/i,
  /\b(?:calculate|check|verify|confirm|determine|work\s+out)\b.{0,100}\b(?:deadline|due\s+date|time\s+to\s+(?:file|respond|answer|serve)|within\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|fourteen|twenty|thirty)\s+(?:calendar\s+|business\s+)?days?)\b/i,
];

const SERVICE_TIMING_INTENT_PATTERN =
  /\b(?:does|did|when|how)\b.{0,50}\bservice\b.{0,60}\b(?:start|trigger|affect|change|extend|deadline|due|clock|time)\b|\b(?:service|served)\b.{0,50}\b(?:start|trigger|affect|change|extend)\b.{0,40}\b(?:deadline|clock|time)\b/i;

const HEARING_TIME_LOOKUP_PATTERN =
  /\b(?:what|when|which)\s+(?:is|are|was|were)?\s*(?:the|my)?\s*(?:hearing|court)\s+(?:date|time)\b|\bwhen\s+is\s+(?:the|my)\s+(?:hearing|court\s+date)\b/i;

export function hasDeadlineQuestion(message: string, _routeMode?: RouteMode) {
  void _routeMode;
  return EXPLICIT_DEADLINE_INTENT_PATTERNS.some((pattern) => pattern.test(message)) ||
    SERVICE_TIMING_INTENT_PATTERN.test(message) ||
    HEARING_TIME_LOOKUP_PATTERN.test(message);
}

export function buildDeadlineAnalysis(args: {
  message: string;
  routeMode?: RouteMode;
  courtFiling?: CourtFilingExtraction | null;
  jurisdiction?: { state?: string | null; county?: string | null; courtName?: string | null };
  userConfirmedReceiptDate?: string | null;
  userConfirmedService?: boolean | null;
  serviceMethod?: string | null;
  timezone?: string | null;
}): DeadlineAnalysis | null {
  if (!hasDeadlineQuestion(args.message, args.routeMode)) {
    return null;
  }

  const sourcedDates = (args.courtFiling?.deadlinesOrHearings ?? [])
    .filter((item) => item.type === 'response_deadline' || item.type === 'hearing')
    .map((item) => ({
      label: item.type === 'hearing' ? 'Hearing date' : 'Response deadline',
      value: item.dateOrTime,
      sourceIds: item.sourceIds,
      pageStart: item.pageStart,
      pageEnd: item.pageEnd,
    }));
  const jurisdiction = [args.jurisdiction?.county, args.jurisdiction?.state]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(', ') || null;
  const missingInputs = [
    !args.jurisdiction?.state ? 'state' : '',
    !args.userConfirmedReceiptDate ? 'date you actually received the filing' : '',
    args.userConfirmedService !== true ? 'whether service was actually completed' : '',
    !args.serviceMethod ? 'service method' : '',
    'governing response rule',
    !args.timezone ? 'court time zone' : '',
  ].filter(Boolean);

  if (sourcedDates.length > 0 && missingInputs.length > 0) {
    return {
      status: 'express_date_only',
      trigger: args.userConfirmedReceiptDate ?? null,
      serviceMethod: args.serviceMethod ?? args.courtFiling?.claimedServiceMethod ?? null,
      governingRule: null,
      jurisdiction,
      timezone: args.timezone ?? null,
      calendarTreatment: null,
      calendarDate: null,
      sourcedDates,
      missingInputs,
      explanation: 'The filing includes date clues, but a legal deadline should not be calculated until service, jurisdiction, the governing rule, calendar treatment, and time zone are verified.',
    };
  }

  return {
    // The governing rule is intentionally always required until a sourced
    // deadline-rule resolver is added, so this builder should not calculate.
    status: missingInputs.length > 0 ? 'needs_inputs' : 'calculation_ready',
    trigger: args.userConfirmedReceiptDate ?? null,
    serviceMethod: args.serviceMethod ?? args.courtFiling?.claimedServiceMethod ?? null,
    governingRule: null,
    jurisdiction,
    timezone: args.timezone ?? null,
    calendarTreatment: null,
    calendarDate: null,
    sourcedDates,
    missingInputs,
    explanation: missingInputs.length > 0
      ? 'Do not calculate a filing deadline yet. First verify the trigger date, service method, court rule, calendar treatment, and time zone.'
      : 'The basic inputs are present, but the governing rule still needs a sourced local or state authority before calculating the calendar date.',
  };
}

export function renderDeadlineAnalysisMarkdown(deadlineAnalysis: DeadlineAnalysis | null) {
  if (!deadlineAnalysis || deadlineAnalysis.status === 'not_applicable') return '';
  const sourcedDates = deadlineAnalysis.sourcedDates.length > 0
    ? deadlineAnalysis.sourcedDates.map((date) => `- ${date.label}: ${date.value}`).join('\n')
    : '- No sourced filing date or hearing date has been confirmed yet.';
  const missing = deadlineAnalysis.missingInputs.length > 0
    ? deadlineAnalysis.missingInputs.map((item) => `- ${item}`).join('\n')
    : '- Sourced governing rule';

  return [
    '**Deadline Check**',
    'Verified dates:',
    sourcedDates,
    'Still needed before calculating a legal deadline:',
    missing,
    deadlineAnalysis.explanation,
  ].join('\n');
}
