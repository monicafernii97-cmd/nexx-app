import type { CourtFilingExtraction } from './courtFilingExtractor';
import type { RouteMode } from '../../types';

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
  readyToDraft: boolean;
  readyForUserReview: boolean;
  readyForAttorneyOrClerkReview: boolean;
  readyForFilingSubmission: boolean;
  isFilingReady: boolean;
  requirements: DraftingRequirement[];
  confirmedFacts: string[];
  missingFacts: string[];
  notApplicableFacts: string[];
  draftingNote: string;
};

export type RequirementStatus =
  | 'confirmed'
  | 'missing'
  | 'not_applicable'
  | 'needs_authority_check';

export type DraftingRequirement = {
  label: DraftFact;
  status: RequirementStatus;
  value: string | null;
  sourceClaimIds: string[];
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

const CORE_CASE_FACTS: DraftFact[] = [
  'court name',
  'cause number',
  'party names',
  'filing type',
  'service date',
  'response deadline',
  'hearing date',
  'relief requested by the other party',
];

const PRO_SE_READINESS_ROUTE_MODES = new Set<RouteMode>([
  'court_ready_drafting',
  'court_response_planning',
  'filing_walkthrough',
  'pro_se_guidance',
]);

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

export function shouldBuildProSeDraftingReadiness(args: { message: string; routeMode?: RouteMode }) {
  return Boolean(
    (args.routeMode && PRO_SE_READINESS_ROUTE_MODES.has(args.routeMode)) ||
    /\b(draft|file|answer|response|declaration|pro se|without (?:a|an) attorney|hearing outline|fee waiver)\b/i.test(args.message)
  );
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
      readyToDraft: true,
      readyForUserReview: true,
      readyForAttorneyOrClerkReview: false,
      readyForFilingSubmission: false,
      isFilingReady: false,
      requirements: FACT_LABELS.map((label) => ({ label, status: 'not_applicable', value: null, sourceClaimIds: [] })),
      confirmedFacts: ['requested document type'],
      missingFacts: [],
      notApplicableFacts: [...FACT_LABELS],
      draftingNote: 'This can be drafted without a full court-filing readiness gate.',
    };
  }

  const confirmedFacts: DraftFact[] = [];
  const missingFacts: DraftFact[] = [];
  const filing = args.courtFiling;
  const applicableFacts = DOCUMENT_FACT_REQUIREMENTS[requestedDocument];
  const serviceDateConfirmed = hasText(args.serviceDate) ||
    Boolean(filing?.userConfirmedReceiptDate && filing.userConfirmedService === true);
  const checks: Record<DraftFact, boolean> = {
    'court name': hasText(args.courtName),
    'cause number': Boolean(args.causeNumberKnown),
    'party names': Boolean(args.partyNamesKnown || filing?.filedBy || filing?.filedAgainst),
    'filing type': Boolean(filing && filing.documentType !== 'unknown'),
    'service date': serviceDateConfirmed,
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

  const requirements: DraftingRequirement[] = FACT_LABELS.map((label) => {
    if (!applicableFacts.includes(label)) {
      return { label, status: 'not_applicable', value: null, sourceClaimIds: [] };
    }
    if (checks[label]) {
      const value = label === 'service date'
        ? args.serviceDate ?? filing?.userConfirmedReceiptDate ?? null
        : label === 'hearing date'
          ? args.hearingDate ?? filing?.deadlinesOrHearings.find((item) => item.type === 'hearing')?.dateOrTime ?? null
          : label === 'response deadline'
            ? args.responseDeadline ?? filing?.deadlinesOrHearings.find((item) => item.type === 'response_deadline')?.dateOrTime ?? null
            : null;
      return { label, status: 'confirmed', value, sourceClaimIds: [] };
    }
    if (label === 'local formatting rules' || label === 'certificate of service requirements') {
      return { label, status: 'needs_authority_check', value: null, sourceClaimIds: [] };
    }
    return { label, status: 'missing', value: null, sourceClaimIds: [] };
  });

  for (const item of applicableFacts) {
    if (checks[item]) confirmedFacts.push(item);
    else missingFacts.push(item);
  }
  const notApplicableFacts = FACT_LABELS.filter((item) => !applicableFacts.includes(item));
  const localRulesRequired = applicableFacts.includes('local formatting rules');
  const missingWithoutLocalRules = missingFacts.filter((fact) => fact !== 'local formatting rules');
  const readinessStage: DraftReadinessStage = missingWithoutLocalRules.length > 0
    ? missingWithoutLocalRules.some((fact) => CORE_CASE_FACTS.includes(fact))
      ? 'missing_case_facts'
      : 'working_draft'
    : localRulesRequired && !args.localFormattingRulesKnown
      ? 'structurally_complete'
      : 'ready_for_final_filing_review';
  const readyToDraft = confirmedFacts.includes('filing type') || Boolean(filing);
  const readyForUserReview = missingFacts.filter((fact) => CORE_CASE_FACTS.includes(fact)).length === 0;
  const readyForAttorneyOrClerkReview = readinessStage === 'structurally_complete' ||
    readinessStage === 'ready_for_final_filing_review';
  const readyForFilingSubmission = false;

  return {
    requestedDocument,
    readinessStage,
    readyToDraft,
    readyForUserReview,
    readyForAttorneyOrClerkReview,
    readyForFilingSubmission,
    isFilingReady: readyForFilingSubmission,
    requirements,
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
