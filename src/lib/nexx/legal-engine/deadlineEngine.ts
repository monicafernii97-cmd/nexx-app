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

function hasDeadlineQuestion(message: string, routeMode?: RouteMode) {
  return routeMode === 'court_response_planning' ||
    routeMode === 'filing_walkthrough' ||
    routeMode === 'court_ready_drafting' ||
    /\b(deadline|due|served|service|hearing|court date|answer by|response by|file by)\b/i.test(message);
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
  if (!hasDeadlineQuestion(args.message, args.routeMode) && !args.courtFiling?.deadlinesOrHearings.length) {
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
