import { describe, expect, it } from 'vitest';
import { buildDeadlineAnalysis, hasDeadlineQuestion } from '../legal-engine/deadlineEngine';
import type { CourtFilingExtraction } from '../legal-engine/courtFilingExtractor';

function filingWithHearing(): CourtFilingExtraction {
  return {
    documentType: 'motion',
    filedBy: 'Petitioner',
    filedAgainst: 'Respondent',
    partyFacts: [],
    reliefRequested: [],
    reliefRequestedClaims: [],
    reliefRequestedFacts: [],
    allegations: [],
    deadlinesOrHearings: [{
      type: 'hearing',
      dateOrTime: 'August 5, 2026 at 10:00 a.m.',
      sourceIds: ['src_hearing'],
      pageStart: 4,
      pageEnd: 4,
    }],
    requestedOrders: [],
    requestedOrderClaims: [],
    requestedOrderFacts: [],
    currentOrderReferences: [],
    currentOrderReferenceClaims: [],
    missingInfoNeeded: [],
    serviceClues: [],
    serviceClueClaims: [],
    serviceClaimedInDocument: false,
    claimedServiceDate: null,
    claimedServiceMethod: null,
    userConfirmedReceiptDate: null,
    userConfirmedService: null,
    serviceValidityVerified: false,
    sourcedFacts: [],
  };
}

describe('deadline intent isolation', () => {
  it.each([
    ['When is my response due?', 'court_response_planning'],
    ['How long do I have after being served to answer?', 'litigation_navigation'],
    ['Does service start the deadline clock?', 'litigation_navigation'],
    ['What is the hearing date?', 'court_response_planning'],
    ['I must file within 20 calendar days. Can you verify that deadline?', 'court_ready_drafting'],
  ] as const)('recognizes an explicit timing request: %s', (message, routeMode) => {
    expect(hasDeadlineQuestion(message, routeMode)).toBe(true);
  });

  it.each([
    ['Draft a court-ready declaration about our communication history.', 'court_ready_drafting'],
    ['What do I file in response to his motion?', 'court_response_planning'],
    ['Walk me through filing this declaration.', 'filing_walkthrough'],
    ['He said he was served years ago, and that hurt my case.', 'litigation_navigation'],
    ['The attached conversation mentions service and a hearing.', 'document_analysis'],
    ['Please summarize this clause: responses must be filed within 20 days.', 'document_analysis'],
    ['Please summarize this filing: The response is due by August 5.', 'document_analysis'],
  ] as const)('does not infer a deadline merely from route or incidental words: %s', (message, routeMode) => {
    expect(hasDeadlineQuestion(message, routeMode)).toBe(false);
  });

  it('does not create a deadline panel from extracted hearing dates unless the user asks about timing', () => {
    const analysis = buildDeadlineAnalysis({
      message: 'Draft a response addressing the allegations in the attached motion.',
      routeMode: 'court_ready_drafting',
      courtFiling: filingWithHearing(),
      jurisdiction: { state: 'Texas', county: 'Harris County' },
    });

    expect(analysis).toBeNull();
  });

  it('uses extracted dates once the user explicitly asks for the hearing date', () => {
    const analysis = buildDeadlineAnalysis({
      message: 'What is the hearing date?',
      routeMode: 'court_response_planning',
      courtFiling: filingWithHearing(),
      jurisdiction: { state: 'Texas', county: 'Harris County' },
    });

    expect(analysis).not.toBeNull();
    expect(analysis?.sourcedDates).toEqual([
      expect.objectContaining({
        label: 'Hearing date',
        value: 'August 5, 2026 at 10:00 a.m.',
      }),
    ]);
  });
});
