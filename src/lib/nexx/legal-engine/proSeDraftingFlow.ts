import type { CourtFilingExtraction } from './courtFilingExtractor';

export type ProSeDraftingDocumentType =
  | 'answer'
  | 'response_to_motion'
  | 'declaration'
  | 'exhibit_list'
  | 'hearing_outline'
  | 'co_parent_message'
  | 'timeline';

export type ProSeDraftingReadiness = {
  requestedDocument: ProSeDraftingDocumentType;
  isFilingReady: boolean;
  confirmedFacts: string[];
  missingFacts: string[];
  draftingNote: string;
};

const BASE_FILING_FACTS = [
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
];

function hasText(value: string | null | undefined) {
  return Boolean(value && value.trim());
}

export function inferRequestedProSeDocument(message: string): ProSeDraftingDocumentType {
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
      isFilingReady: true,
      confirmedFacts: ['requested document type'],
      missingFacts: [],
      draftingNote: 'This can be drafted without a full court-filing readiness gate.',
    };
  }

  const confirmedFacts: string[] = [];
  const missingFacts: string[] = [];
  const filing = args.courtFiling;
  const checks: Record<string, boolean> = {
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

  for (const item of BASE_FILING_FACTS) {
    if (checks[item]) confirmedFacts.push(item);
    else missingFacts.push(item);
  }

  return {
    requestedDocument,
    isFilingReady: missingFacts.length === 0,
    confirmedFacts,
    missingFacts,
    draftingNote: missingFacts.length === 0
      ? 'The draft can be treated as filing-ready after final user review.'
      : 'This can be drafted as a working draft, but it should not be treated as filing-ready until the missing facts are confirmed.',
  };
}
