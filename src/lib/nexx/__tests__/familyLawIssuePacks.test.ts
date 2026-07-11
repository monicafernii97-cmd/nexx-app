import { describe, expect, it } from 'vitest';
import { detectDocumentReference } from '../documentReferenceDetection';
import {
  retrieveRelevantDocumentChunks,
  type DocumentChunkRetrievalCandidate,
} from '../documentChunkRetrieval';
import { extractCourtFilingFromSources } from '../legal-engine/courtFilingExtractor';
import {
  FAMILY_LAW_ISSUE_PACKS,
  FAMILY_LAW_ISSUE_PACK_IDS,
  detectFamilyLawIssuePackIds,
} from '../legal-engine/issuePacks/familyLawIssuePacks';
import {
  buildLitigationNavigationResponse,
  mergeCourtFilingIntoLitigationNavigation,
  renderLitigationNavigationMarkdown,
} from '../legal-engine/litigationNavigationRenderer';
import { verifyRenderedOutput } from '../legal-engine/renderedOutputVerifier';
import { classifyMessage } from '../router';
import type { LegalDocumentSourcePacket } from '../legalDocumentAnswer';

function chunk(overrides: Partial<DocumentChunkRetrievalCandidate>): DocumentChunkRetrievalCandidate {
  return {
    chunkId: 'chunk-default',
    uploadedFileId: 'file-default',
    chunkIndex: 0,
    text: '',
    textLength: 0,
    warnings: [],
    ...overrides,
  };
}

function sourceFromChunk(item: DocumentChunkRetrievalCandidate): LegalDocumentSourcePacket {
  return {
    sourceId: `src_${item.chunkId.replace(/[^a-z0-9]/gi, '_')}`,
    fileId: item.uploadedFileId,
    fileName: 'motion-to-enforce.pdf',
    chunkId: item.chunkId,
    blockIds: [],
    pageStart: item.pageStart,
    pageEnd: item.pageEnd,
    text: item.text,
  };
}

describe('family-law issue packs', () => {
  it('defines the required P2 issue packs with complete operational metadata', () => {
    expect(FAMILY_LAW_ISSUE_PACK_IDS).toEqual([
      'enforcement_contempt',
      'modification_temporary_orders',
      'child_support_arrears',
      'school_medical_decision_authority',
      'exchange_location_time',
      'relocation_travel_passports',
      'communication_notice',
      'protective_order_family_violence',
      'fee_waiver_cost_access',
      'discovery_subpoena_evidence',
    ]);

    for (const pack of FAMILY_LAW_ISSUE_PACKS) {
      expect(pack.intentTriggers.length).toBeGreaterThan(0);
      expect(pack.documentRetrievalBuckets.length).toBeGreaterThan(0);
      expect(pack.orderHierarchy.length).toBeGreaterThan(0);
      expect(pack.statutoryAndLocalRuleTargets.length).toBeGreaterThan(0);
      expect(pack.requiredEvidence.length).toBeGreaterThan(0);
      expect(pack.counterarguments.length).toBeGreaterThan(0);
      expect(pack.courtSafeResponseDrafts.neutral).toMatch(/\w/);
      expect(pack.filingReadinessRequirements.length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['enforcement_contempt', 'He filed a motion to enforce and says contempt.'],
    ['modification_temporary_orders', 'He filed to modify custody and asks for temporary orders.'],
    ['child_support_arrears', 'The arrears worksheet says unpaid child support.'],
    ['school_medical_decision_authority', 'Does the order give him school enrollment and medical decision authority?'],
    ['exchange_location_time', 'He changed the pickup location and refuses the exchange.'],
    ['relocation_travel_passports', 'She wants passports for international travel and relocation.'],
    ['communication_notice', 'Does AppClose count as written notice under the order?'],
    ['protective_order_family_violence', 'I need a protective order because he threatened to hurt me.'],
    ['fee_waiver_cost_access', 'I cannot afford the filing fee and need a fee waiver.'],
    ['discovery_subpoena_evidence', 'He sent subpoenas and discovery requests.'],
  ] as const)('detects %s', (expectedPack, message) => {
    expect(detectFamilyLawIssuePackIds(message)).toContain(expectedPack);
  });

  it('uses issue-pack retrieval terms for school and medical authority clauses', () => {
    const chunks: DocumentChunkRetrievalCandidate[] = [
      chunk({
        chunkId: 'background',
        chunkIndex: 0,
        text: 'The order includes background findings about the parties.',
        textLength: 58,
        sectionHeading: 'Findings',
      }),
      chunk({
        chunkId: 'school-medical',
        chunkIndex: 7,
        text: 'Mother has the exclusive right to make educational decisions, school enrollment decisions, and non-emergency medical decisions after consultation.',
        textLength: 139,
        sectionHeading: 'Rights and Duties',
        retrievalMetadata: { containsOrderLanguage: true },
      }),
      chunk({
        chunkId: 'notice',
        chunkIndex: 8,
        text: 'Each parent must confer with the other parent and provide notice before non-emergency treatment when reasonably possible.',
        textLength: 121,
        sectionHeading: 'Notice and Consultation',
      }),
    ];
    const message = 'Under my order, who has school enrollment and medical decision-making authority?';
    const result = retrieveRelevantDocumentChunks({
      message,
      detection: detectDocumentReference(message),
      chunks,
      maxChunks: 2,
    });

    expect(result.map((item) => item.chunkId)).toContain('school-medical');
    expect(result.find((item) => item.chunkId === 'school-medical')?.retrievalBuckets).toContain('controlling_specific_clause');
  });

  it('enriches navigation, evidence, pro se risk, and filing readiness from detected packs', () => {
    const message = [
      'He filed a motion to enforce unpaid child support arrears and sent subpoenas.',
      'I got served yesterday and cannot afford an attorney.',
      'What do I need to show the judge?',
    ].join(' ');
    const response = buildLitigationNavigationResponse({
      message,
      routeMode: 'packed_case_intake',
    });

    expect(response.issueBreakdown.map((issue) => issue.issue)).toEqual(expect.arrayContaining([
      'Enforcement and contempt',
      'Child support, payments, and arrears',
      'Discovery, subpoenas, and evidence requests',
      'Fee waivers and inability-to-afford forms',
    ]));
    expect(response.evidencePlan.evidenceToSave).toEqual(expect.arrayContaining([
      'official payment record',
      'complete request or subpoena',
    ]));
    expect(response.proSeAssessment.tasksHigherRiskWithoutAttorney.join(' ')).toMatch(/enforcement|discovery/i);
    expect(response.filingPlan.filingReadinessChecklist).toEqual(expect.arrayContaining([
      'ability-to-comply facts',
      'claimed arrears period',
      'complete discovery request',
      'fee-waiver need',
    ]));
  });

  it('runs a staging-style issue-pack flow without leaking internal metadata', () => {
    const message = 'What do I file in response to this motion, and what evidence do I need for child support arrears and discovery?';
    const route = classifyMessage(message);
    const filingChunks: DocumentChunkRetrievalCandidate[] = [
      chunk({
        chunkId: 'page-1',
        uploadedFileId: 'file-motion',
        chunkIndex: 0,
        pageStart: 1,
        pageEnd: 1,
        text: 'Cause No. 123. Motion to Enforce Child Support and Discovery Orders. Petitioner asks the Court to hold Respondent in contempt.',
        textLength: 130,
        sectionHeading: 'Caption and Motion Title',
      }),
      chunk({
        chunkId: 'page-8',
        uploadedFileId: 'file-motion',
        chunkIndex: 7,
        pageStart: 8,
        pageEnd: 8,
        text: 'Petitioner alleges unpaid child support arrears for January through March and requests judgment for arrears.',
        textLength: 106,
        sectionHeading: 'Allegations and Grounds',
      }),
      chunk({
        chunkId: 'page-16',
        uploadedFileId: 'file-motion',
        chunkIndex: 15,
        pageStart: 16,
        pageEnd: 16,
        text: 'Request for production asks Respondent to produce payment records, bank statements, and communications about support.',
        textLength: 116,
        sectionHeading: 'Discovery Requests',
      }),
      chunk({
        chunkId: 'page-24',
        uploadedFileId: 'file-motion',
        chunkIndex: 23,
        pageStart: 24,
        pageEnd: 24,
        text: 'Prayer. Petitioner requests contempt, arrears judgment, attorney fees, and any other relief to which Petitioner is entitled.',
        textLength: 124,
        sectionHeading: 'Prayer for Relief',
      }),
      chunk({
        chunkId: 'page-29',
        uploadedFileId: 'file-motion',
        chunkIndex: 28,
        pageStart: 29,
        pageEnd: 29,
        text: 'Certificate of service. This filing was served by email on July 1, 2026.',
        textLength: 77,
        sectionHeading: 'Certificate of Service',
      }),
    ];
    const retrieved = retrieveRelevantDocumentChunks({
      message,
      detection: detectDocumentReference(message),
      chunks: filingChunks,
      maxChunks: 8,
    });
    const extraction = extractCourtFilingFromSources(retrieved.map(sourceFromChunk));
    const response = mergeCourtFilingIntoLitigationNavigation(
      buildLitigationNavigationResponse({
        message,
        routeMode: route.mode,
        courtFiling: extraction,
      }),
      extraction
    );
    const rendered = renderLitigationNavigationMarkdown(response, {
      routeMode: route.mode,
      userMessage: message,
    });
    const verification = verifyRenderedOutput({
      rendered,
      userMessage: message,
      routeMode: route.mode,
    });

    expect(route.mode).toBe('court_response_planning');
    expect(retrieved.map((item) => item.chunkId)).toEqual(expect.arrayContaining(['page-1', 'page-8', 'page-16', 'page-24', 'page-29']));
    expect(response.issueBreakdown.map((issue) => issue.issue)).toEqual(expect.arrayContaining([
      'Enforcement and contempt',
      'Child support, payments, and arrears',
      'Discovery, subpoenas, and evidence requests',
    ]));
    expect(rendered).toContain('when you actually received the filing and how you received it');
    expect(rendered).not.toMatch(/\b(?:OCR|retrieval|verifier|sourceId|chunkId|confidence|internal metadata)\b/i);
    expect(verification.passed).toBe(true);
  });
});
