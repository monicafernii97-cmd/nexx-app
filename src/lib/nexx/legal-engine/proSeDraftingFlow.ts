import type { CourtFilingExtraction } from './courtFilingExtractor';

export type ProSeDraftingDocumentType =
  | 'answer'
  | 'response_to_motion'
  | 'declaration'
  | 'fee_waiver'
  | 'exhibit_list'
  | 'hearing_outline'
  | 'co_parent_message'
  | 'timeline';

export type DraftReadinessStage =
  | 'working_draft'
  | 'missing_case_facts'
  | 'structurally_complete'
  | 'local_rules_verified'
  | 'ready_for_final_filing_review';

export type ProSeDraftingReadiness = {
  requestedDocument: ProSeDraftingDocumentType;
  readinessStage: DraftReadinessStage;
  isFilingReady: boolean;
  confirmedFacts: string[];
  missingFacts: string[];
  notApplicableFacts: string[];
  draftingNote: string;
};

const FACT_LABELS = [
  'court name',
  'cause number',
  'party names',
  'filing type',
  'service date',
  'hearing date',
  'response deadline',
  'current order',
  'relief requested by the other party',
  'your requested outcome',
  'facts in date order',
  'exhibits',
  'certificate of service requirements',
  'signature and contact block',
  'local formatting rules',
  'fee waiver need',
] as const;

type DraftFact = typeof FACT_LABELS[number];

const DOCUMENT_FACT_REQUIREMENTS: Record<ProSeDraftingDocumentType, DraftFact[]> = {
  answer: [
    'court name',
    'cause number',
    'party names',
    'filing type',
    'service date',
    'response deadline',
    'relief requested by the other party',
    'your requested outcome',
    'facts in date order',
    'certificate of service requirements',
    'signature and contact block',
    'local formatting rules',
    'fee waiver need',
  ],
  response_to_motion: [
    'court name',
    'cause number',
    'party names',
    'filing type',
    'service date',
    'hearing date',
    'response deadline',
    'current order',
    'relief requested by the other party',
    'your requested outcome',
    'facts in date order',
    'exhibits',
    'certificate of service requirements',
    'signature and contact block',
    'local formatting rules',
    'fee waiver need',
  ],
  declaration: [
    'court name',
    'cause number',
    'party names',
    'filing type',
    'facts in date order',
    'exhibits',
    'signature and contact block',
    'local formatting rules',
  ],
  fee_waiver: [
    'court name',
    'cause number',
    'party names',
    'fee waiver need',
    'signature and contact block',
    'local formatting rules',
  ],
  exhibit_list: [
    'court name',
    'cause number',
    'party names',
    'exhibits',
    'signature and contact block',
    'local formatting rules',
  ],
  hearing_outline: [
    'court name',
    'cause number',
    'party names',
    'hearing date',
    'current order',
    'relief requested by the other party',
    'your requested outcome',
    'facts in date order',
    'exhibits',
  ],
  co_parent_message: [],
  timeline: [],
};

function hasText(value: string | null | undefined) {
  return Boolean(value && value.trim());
}

export function inferRequestedProSeDocument(message: string): ProSeDraftingDocumentType {
  if (/\bfee\s+waiver|statement of inability|cannot afford court costs|can'?t afford court costs\b/i.test(message)) return 'fee_waiver';
  if (/\bexhibit\s+list\b/i.test(message)) return 'exhibit_list';
  if (/\bhearing\s+outline|what\s+to\s+say\s+in\s+court\b/i.test(message)) return 'hearing_outline';
  if (/\btimeline\b/i.test(message)) return 'timeline';
  if (/\bdeclaration|statement|affidavit\b/i.test(message)) return 'declaration';
  if (/\bco[-\s]?parent|text|message|respond\s+to\s+(?:him|her)\b/i.test(message)) return 'co_parent_message';
  if (/\banswer\b/i.test(message)) return 'answer';
  return 'response_to_motion';
}

export function buildProSeDraftingReadiness(args: {
  message: string;
  courtName?: string | null;
  causeNumberKnown?: boolean;
  partyNamesKnown?: boolean;
  serviceDate?: string | null;
  hearingDate?: string | null;
  responseDeadline?: string | null;
  hasCurrentOrder?: boolean | null;
  userRequestedOutcome?: string | null;
  factsInDateOrder?: boolean;
  exhibitsKnown?: boolean;
  feeWaiverNeedKnown?: boolean;
  certificateOfServiceKnown?: boolean;
  signatureBlockKnown?: boolean;
  localFormattingRulesKnown?: boolean;
  courtFiling?: CourtFilingExtraction | null;
}): ProSeDraftingReadiness {
  const requestedDocument = inferRequestedProSeDocument(args.message);
  if (requestedDocument === 'co_parent_message' || requestedDocument === 'timeline') {
    return {
      requestedDocument,
      readinessStage: 'structurally_complete',
      isFilingReady: true,
      confirmedFacts: ['requested document type'],
      missingFacts: [],
      notApplicableFacts: [...FACT_LABELS],
      draftingNote: 'This can be drafted without a full court-filing readiness gate.',
    };
  }

  const confirmedFacts: string[] = [];
  const missingFacts: string[] = [];
  const filing = args.courtFiling;
  const applicableFacts = DOCUMENT_FACT_REQUIREMENTS[requestedDocument];
  const checks: Record<DraftFact, boolean> = {
    'court name': hasText(args.courtName),
    'cause number': Boolean(args.causeNumberKnown),
    'party names': Boolean(args.partyNamesKnown || filing?.filedBy || filing?.filedAgainst),
    'filing type': Boolean(filing && filing.documentType !== 'unknown'),
    'service date': hasText(args.serviceDate) || Boolean(filing?.serviceClues.length),
    'hearing date': hasText(args.hearingDate) || Boolean(filing?.deadlinesOrHearings.some((item) => item.type === 'hearing')),
    'response deadline': hasText(args.responseDeadline) || Boolean(filing?.deadlinesOrHearings.some((item) => item.type === 'response_deadline')),
    'current order': args.hasCurrentOrder === true || Boolean(filing?.currentOrderReferences.length),
    'relief requested by the other party': Boolean(filing?.reliefRequested.length || filing?.requestedOrders.length),
    'your requested outcome': hasText(args.userRequestedOutcome),
    'facts in date order': Boolean(args.factsInDateOrder),
    exhibits: Boolean(args.exhibitsKnown),
    'certificate of service requirements': Boolean(args.certificateOfServiceKnown),
    'signature and contact block': Boolean(args.signatureBlockKnown),
    'local formatting rules': Boolean(args.localFormattingRulesKnown),
    'fee waiver need': Boolean(args.feeWaiverNeedKnown),
  };

  for (const item of applicableFacts) {
    if (checks[item]) confirmedFacts.push(item);
    else missingFacts.push(item);
  }
  const notApplicableFacts = FACT_LABELS.filter((item) => !applicableFacts.includes(item));
  const localRulesRequired = applicableFacts.includes('local formatting rules');
  const missingWithoutLocalRules = missingFacts.filter((fact) => fact !== 'local formatting rules');
  const readinessStage: DraftReadinessStage = missingWithoutLocalRules.length > 0
    ? missingWithoutLocalRules.some((fact) =>
      [
        'court name',
        'cause number',
        'party names',
        'filing type',
        'service date',
        'response deadline',
        'hearing date',
        'relief requested by the other party',
      ].includes(fact)
    )
      ? 'missing_case_facts'
      : 'working_draft'
    : localRulesRequired && !args.localFormattingRulesKnown
      ? 'structurally_complete'
      : 'ready_for_final_filing_review';

  return {
    requestedDocument,
    readinessStage,
    isFilingReady: readinessStage === 'ready_for_final_filing_review',
    confirmedFacts,
    missingFacts,
    notApplicableFacts,
    draftingNote: readinessStage === 'ready_for_final_filing_review'
      ? 'Ready for final filing review after the user confirms the facts are accurate.'
      : 'This can be drafted as a working draft, but it should not be treated as ready for filing until the missing applicable facts are confirmed.',
  };
}

export function renderProSeDraftingReadinessMarkdown(readiness: ProSeDraftingReadiness | null) {
  if (!readiness || readiness.requestedDocument === 'co_parent_message' || readiness.requestedDocument === 'timeline') return '';
  const status =
    readiness.readinessStage === 'ready_for_final_filing_review'
      ? 'Ready for final filing review.'
      : readiness.readinessStage === 'structurally_complete'
        ? 'Structurally started, but local formatting and filing rules still need review.'
        : readiness.readinessStage === 'missing_case_facts'
          ? 'Missing core case facts before this should be treated as a court draft.'
          : 'Working draft only.';
  const missing = readiness.missingFacts.length > 0
    ? readiness.missingFacts.slice(0, 8).map((fact) => `- ${fact}`).join('\n')
    : '- No applicable missing facts identified in this pass.';

  return [
    '**Draft Readiness**',
    status,
    'Still needed:',
    missing,
  ].join('\n');
}
