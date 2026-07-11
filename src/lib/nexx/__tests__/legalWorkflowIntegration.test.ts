import { describe, expect, it } from 'vitest';
import { buildDeadlineAnalysis } from '../legal-engine/deadlineEngine';
import { buildLegalBasisList } from '../legal-engine/legalAuthority';
import { buildLocalLegalResourceLookup } from '../legal-engine/localResourceLookup';
import { resolveOrderVersion } from '../legal-engine/orderVersionResolver';
import { buildProSeDraftingReadiness } from '../legal-engine/proSeDraftingFlow';
import type { CourtFilingExtraction } from '../legal-engine/courtFilingExtractor';
import type { LitigationNavigationResponse } from '../legal-engine/litigationNavigationSchema';
import type { LegalDocumentSourcePacket } from '../legalDocumentAnswer';

function packet(overrides: Partial<LegalDocumentSourcePacket>): LegalDocumentSourcePacket {
  return {
    sourceId: 'src_default',
    fileId: 'file_default',
    fileName: 'document.pdf',
    chunkId: 'chunk_default',
    blockIds: [],
    pageStart: 1,
    pageEnd: 1,
    text: '',
    ...overrides,
  };
}

function filing(overrides: Partial<CourtFilingExtraction> = {}): CourtFilingExtraction {
  return {
    documentType: 'modification',
    filedBy: 'Petitioner',
    filedAgainst: 'Respondent',
    partyFacts: [],
    reliefRequested: ['modify conservatorship'],
    reliefRequestedClaims: [],
    reliefRequestedFacts: [],
    allegations: [
      {
        allegation: 'Respondent denied possession on May 3, 2026.',
        sourceIds: ['src_allegation'],
        pageStart: 6,
        pageEnd: 6,
      },
    ],
    deadlinesOrHearings: [
      {
        type: 'hearing',
        dateOrTime: 'August 5, 2026 at 10:00 a.m.',
        sourceIds: ['src_hearing'],
        pageStart: 27,
        pageEnd: 27,
      },
    ],
    requestedOrders: ['modify conservatorship'],
    requestedOrderClaims: [],
    requestedOrderFacts: [],
    currentOrderReferences: [],
    currentOrderReferenceClaims: [],
    missingInfoNeeded: [],
    serviceClues: ['Certificate of service states service by email.'],
    serviceClueClaims: [],
    serviceClaimedInDocument: true,
    claimedServiceDate: null,
    claimedServiceMethod: 'email',
    userConfirmedReceiptDate: null,
    userConfirmedService: null,
    serviceValidityVerified: false,
    sourcedFacts: [],
    ...overrides,
  };
}

describe('P1 legal workflow integration helpers', () => {
  it('builds official Texas resource lookup without inventing exact fees', () => {
    const lookup = buildLocalLegalResourceLookup({
      message: 'I need legal aid, filing fee, and limited-scope resources.',
      routeMode: 'attorney_resource_guidance',
      state: 'Texas',
      county: 'Harris County',
    });

    expect(lookup).not.toBeNull();
    expect(lookup?.resources.some((resource) => resource.type === 'district_clerk' && resource.url)).toBe(true);
    expect(lookup?.resources.some((resource) => resource.type === 'efiling')).toBe(true);
    expect(lookup?.resources.some((resource) => resource.type === 'fee_waiver')).toBe(true);
    expect(lookup?.feeSources.every((source) => Object.prototype.hasOwnProperty.call(source, 'url'))).toBe(true);
    expect(lookup?.exactFeeFindings).toEqual([]);
  });

  it('keeps generic resources for non-Texas counties without a verified clerk source', () => {
    const lookup = buildLocalLegalResourceLookup({
      message: 'I need legal aid and court forms.',
      routeMode: 'pro_se_guidance',
      state: 'Pennsylvania',
      county: 'Allegheny County',
    });

    expect(lookup?.resources.some((resource) => resource.name === 'LawHelp.org')).toBe(true);
    expect(lookup?.resources.some((resource) => resource.name.includes('National Center for State Courts'))).toBe(true);
    expect(lookup?.resources.some((resource) => resource.type === 'district_clerk' && resource.url === null)).toBe(false);
  });

  it('keeps pro se readiness document-specific instead of using one universal checklist', () => {
    const readiness = buildProSeDraftingReadiness({
      message: 'Help me build a hearing outline.',
      courtName: '245th District Court',
      causeNumberKnown: true,
      partyNamesKnown: true,
      hearingDate: 'August 5, 2026',
      hasCurrentOrder: true,
      userRequestedOutcome: 'deny the requested modification',
      factsInDateOrder: true,
      exhibitsKnown: true,
    });

    expect(readiness.requestedDocument).toBe('hearing_outline');
    expect(readiness.missingFacts).not.toContain('certificate of service requirements');
    expect(readiness.missingFacts).not.toContain('fee waiver need');
    expect(readiness.notApplicableFacts).toContain('certificate of service requirements');
    expect(readiness.notApplicableFacts).toContain('fee waiver need');
  });

  it('allows a response draft to reach final-review readiness when applicable facts are known', () => {
    const readiness = buildProSeDraftingReadiness({
      message: 'Draft my response to the motion.',
      courtName: '245th District Court',
      causeNumberKnown: true,
      partyNamesKnown: true,
      serviceDate: 'July 10, 2026',
      hearingDate: 'August 5, 2026',
      responseDeadline: 'July 24, 2026',
      hasCurrentOrder: true,
      userRequestedOutcome: 'deny the motion',
      factsInDateOrder: true,
      exhibitsKnown: true,
      feeWaiverNeedKnown: true,
      certificateOfServiceKnown: true,
      signatureBlockKnown: true,
      localFormattingRulesKnown: true,
      courtFiling: filing(),
    });

    expect(readiness.requestedDocument).toBe('response_to_motion');
    expect(readiness.missingFacts).toEqual([]);
    expect(readiness.readinessStage).toBe('ready_for_final_filing_review');
    expect(readiness.readyForAttorneyOrClerkReview).toBe(true);
    expect(readiness.readyForFilingSubmission).toBe(false);
    expect(readiness.isFilingReady).toBe(false);
  });

  it('does not treat a certificate of service in the filing as the user service date', () => {
    const readiness = buildProSeDraftingReadiness({
      message: 'Draft my response to the motion.',
      courtName: '245th District Court',
      causeNumberKnown: true,
      partyNamesKnown: true,
      hearingDate: 'August 5, 2026',
      responseDeadline: 'July 24, 2026',
      hasCurrentOrder: true,
      userRequestedOutcome: 'deny the motion',
      factsInDateOrder: true,
      exhibitsKnown: true,
      feeWaiverNeedKnown: true,
      certificateOfServiceKnown: true,
      signatureBlockKnown: true,
      localFormattingRulesKnown: true,
      courtFiling: filing(),
    });

    expect(readiness.missingFacts).toContain('service date');
    expect(readiness.requirements).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'service date', status: 'missing' }),
    ]));
  });

  it('does not treat a proposed order as an enforceable controlling order', () => {
    const orderVersion = resolveOrderVersion([
      packet({
        sourceId: 'src_proposed',
        fileId: 'file_proposed',
        fileName: 'proposed-order.pdf',
        text: 'Proposed Order. This draft order is unsigned.',
      }),
    ]);

    expect(orderVersion.authorityStatus.status).toBe('proposed_unsigned');
    expect(orderVersion.authorityStatus.enforceabilityConfirmed).toBe(false);
    expect(orderVersion.authorityStatus.signedDate).toBeNull();
    expect(orderVersion.authorityStatus.filedDate).toBeNull();
    expect(orderVersion.authorityStatus.supersededBy).toBeNull();
  });

  it('does not infer signed status from generic ordered or judge language', () => {
    const orderVersion = resolveOrderVersion([
      packet({
        sourceId: 'src_generic_proposed',
        fileId: 'file_generic_proposed',
        fileName: 'proposed-temporary-orders.pdf',
        text: 'Proposed Order. This draft order is unsigned. The judge ordered that the parties appear, and the clerk entered the proposed form into the record.',
      }),
    ]);

    expect(orderVersion.authorityStatus.status).toBe('proposed_unsigned');
    expect(orderVersion.authorityStatus.enforceabilityConfirmed).toBe(false);
  });

  it('prefers a signed entered order when multiple order-like documents are present', () => {
    const orderVersion = resolveOrderVersion([
      packet({
        sourceId: 'src_old',
        fileId: 'file_old',
        fileName: 'old-order.pdf',
        text: 'Prior final order superseded by amended order.',
      }),
      packet({
        sourceId: 'src_current',
        fileId: 'file_current',
        fileName: 'amended-order.pdf',
        text: 'Amended Final Order signed on July 1, 2026 and entered on July 2, 2026. It is ordered and decreed.',
      }),
    ]);

    expect(orderVersion.activeOrderFileId).toBe('file_current');
    expect(orderVersion.authorityStatus.status).toBe('signed_and_entered');
    expect(orderVersion.authorityStatus.enforceabilityConfirmed).toBe(true);
    expect(orderVersion.needsUserSelection).toBe(false);
  });

  it('keeps deadline analysis transparent until service, rule, calendar, and timezone are verified', () => {
    const analysis = buildDeadlineAnalysis({
      message: 'When is my response due?',
      routeMode: 'court_response_planning',
      courtFiling: filing(),
      jurisdiction: { state: 'Texas', county: 'Harris County' },
      userConfirmedReceiptDate: null,
      userConfirmedService: null,
      serviceMethod: 'email',
      timezone: null,
    });

    expect(analysis?.status).toBe('express_date_only');
    expect(analysis?.calendarDate).toBeNull();
    expect(analysis?.missingInputs).toContain('date you actually received the filing');
    expect(analysis?.missingInputs).toContain('whether service was actually completed');
    expect(analysis?.missingInputs).toContain('governing response rule');
    expect(analysis?.missingInputs).toContain('court time zone');
  });

  it('separates document facts from local-procedure authority in legal basis metadata', () => {
    const litigationNavigation: LitigationNavigationResponse = {
      answerType: 'litigation_navigation',
      supportiveSummary: '',
      immediatePriority: {
        priority: '',
        whyItMatters: '',
        whatToDoNow: '',
      },
      issueBreakdown: [],
      courtPosture: {
        whatWeKnow: [],
        whatWeNeed: [],
        possibleFilingOrResponse: 'unknown',
        candidateResponsePaths: [
          {
            candidate: 'answer or written response',
            reason: 'The filing appears to request court action, but local procedure must be verified.',
            jurisdictionVerificationRequired: true,
            localAuthoritySourceIds: [],
            status: 'possible',
          },
        ],
        deadlineNote: null,
        hearingNote: null,
      },
      coParentResponse: {
        needed: false,
        strategy: '',
        neutralDraft: null,
        firmerDraft: null,
        whatNotToSay: [],
      },
      evidencePlan: {
        timelineItems: [],
        evidenceToSave: [],
        neutralFraming: [],
        exhibitIdeas: [],
      },
      proSeAssessment: {
        possibleProSe: false,
        practicalRead: '',
        tasksLikelyDoableProSe: [],
        tasksHigherRiskWithoutAttorney: [],
        limitedScopeHelpRecommendedFor: [],
      },
      costOverview: {
        proSeCostCategories: [],
        attorneyCostCategories: [],
        exactCostsRequireLocalLookup: true,
        costExplanation: '',
      },
      resourcePlan: {
        stateNeeded: false,
        countyNeeded: false,
        resourceTypesToFind: [],
        suggestedSearchTargets: [],
      },
      judgeExplanation: {
        simpleTheory: '',
        judgeReadyStructure: [],
        sampleOpening: null,
      },
      filingPlan: {
        likelyNextDocument: null,
        filingReadinessChecklist: [],
        nextInfoNeededBeforeDrafting: [],
      },
      nextSteps: [],
    };
    const bases = buildLegalBasisList({
      litigationNavigation,
      jurisdiction: 'Harris County, Texas',
    });

    expect(bases).toEqual(expect.arrayContaining([
      expect.objectContaining({
        basisType: 'general_practice',
        proposition: expect.stringMatching(/answer or written response/i),
        jurisdiction: 'Harris County, Texas',
      }),
    ]));
  });
});
