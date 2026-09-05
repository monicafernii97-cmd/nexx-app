import { describe, expect, it } from 'vitest';
import type { CapabilityDecision, DocumentCapabilitySnapshot } from '../capabilities/types';
import { assessGenericAnswer, isGenericCanonicalLegalAnswer } from '../legal-engine/genericAnswerPolicy';
import type { TurnExecutionPlan } from '../orchestration/types';
import { verifyResponseClaims } from '../response/claimVerifier';
import { buildPublicationRepairContent, decideRepair } from '../response/repairPolicy';
import {
  mintPublicationEnvelope,
  PUBLICATION_VALIDATOR_V2_VERSION,
  serializePublicationEnvelope,
  validatePersistedEnvelope,
} from '../response/publicationContract';

const snapshot: DocumentCapabilitySnapshot = {
  schemaVersion: 1,
  turnId: 'turn-1',
  computedAt: 1,
  documents: [],
  tools: { webSearch: false, fileSearch: false, outputContinuation: false, deterministicTextSearch: false },
  snapshotHash: 'cap_test',
};

const capabilityDecision: CapabilityDecision = {
  allowed: true,
  supportLevel: 'scoped',
  usableDocumentIds: [],
  missingRequirements: [],
  prohibitedClaims: [],
  userSafeLimitations: [],
  alternateOperations: [],
};

function plan(overrides: Partial<TurnExecutionPlan> = {}): TurnExecutionPlan {
  return {
    schemaVersion: 1,
    planId: 'plan-1',
    taskId: 'task-1',
    focusRevision: 1,
    responseAct: 'answer',
    routeMode: 'adaptive_chat',
    selectedDocumentIds: [],
    evidenceRequirements: [],
    retrievalQueries: [],
    capabilityRequirements: [],
    fallbackOrder: [],
    questionKind: 'other',
    ...overrides,
  };
}

function verify(content: string, overrides: Partial<Parameters<typeof verifyResponseClaims>[0]> = {}) {
  return verifyResponseClaims({
    content,
    plan: plan(),
    capabilitySnapshot: snapshot,
    capabilityDecision,
    evidenceIds: [],
    expectedFocusRevision: 1,
    currentFocusRevision: 1,
    publicationV2: true,
    ...overrides,
  });
}

describe('publication quality v2', () => {
  it('detects two generic sentences that previously bypassed a whole-response regex', () => {
    const content = 'This order contains the following relevant provisions. Here are some relevant details.';
    expect(assessGenericAnswer(content)).toMatchObject({
      isGeneric: true,
      genericSentenceCount: 2,
      substantiveSentenceCount: 0,
      reasonCodes: expect.arrayContaining(['multiple_generic_sentences']),
    });
    expect(verify(content, { evidenceIds: ['chunk-1'] }).errors).toContain('RESP_GENERIC_WHEN_EVIDENCE_AVAILABLE');
  });

  it('detects generic padding around a generic core', () => {
    const assessment = assessGenericAnswer('Certainly. Here are the key provisions in the order. I hope this helps.');
    expect(assessment.isGeneric).toBe(true);
    expect(assessment.reasonCodes).toContain('generic_core_with_padding');
  });

  it('detects the specified generic sentence plus generic limitation bypass', () => {
    const content = [
      'This order contains the following relevant provisions.',
      'The exhaustive review is not ready, but I can still use the extracted text for focused work.',
    ].join('\n');
    const assessment = assessGenericAnswer(content);
    expect(assessment).toMatchObject({
      isGeneric: true,
      genericSentenceCount: 1,
      limitationSentenceCount: 1,
      substantiveSentenceCount: 0,
      reasonCodes: expect.arrayContaining(['generic_core_with_limitation']),
    });
    expect(verify(content, { evidenceIds: ['chunk-1'], requiresDirectAnswer: true }).errors)
      .toEqual(expect.arrayContaining(['RESP_GENERIC_MULTI_SENTENCE', 'RESP_FALLBACK_NOT_CONTEXTUAL']));
  });

  it('normalizes markdown headings and bullets before generic detection', () => {
    expect(assessGenericAnswer('## Result\n- This order contains the following relevant provisions.\n- I hope this helps.'))
      .toMatchObject({ isGeneric: true, substantiveSentenceCount: 0 });
  });

  it('rejects a generic direct answer even when retrieval produced no evidence', () => {
    expect(verify('I can help you with that.', { requiresDirectAnswer: true }).errors)
      .toContain('RESP_GENERIC_WHEN_EVIDENCE_AVAILABLE');
  });

  it('does not reject a generic lead-in followed by a concrete answer', () => {
    const content = 'Here are the key provisions in the order. Weekend possession begins Friday at 6:00 p.m.';
    expect(assessGenericAnswer(content).isGeneric).toBe(false);
    expect(isGenericCanonicalLegalAnswer(content)).toBe(false);
  });

  it('does not let a second generic sentence hide the first generic sentence', () => {
    const content = 'Here are the key provisions in the order. I can help you with that.';
    expect(assessGenericAnswer(content)).toMatchObject({
      isGeneric: true,
      genericSentenceCount: 2,
      substantiveSentenceCount: 0,
    });
    expect(isGenericCanonicalLegalAnswer(content)).toBe(true);
  });

  it('rejects document analysis on a social turn', () => {
    expect(verify('According to the order, the possession clause controls.', {
      speechAct: 'social',
    }).errors).toEqual(expect.arrayContaining([
      'RESP_DOCUMENT_ANALYSIS_ON_SOCIAL_TURN',
      'RESP_SPEECH_ACT_MISMATCH',
      'RESP_UNREQUESTED_DOCUMENT_USE',
    ]));
  });

  it('rejects even a friendly document mention on a greeting turn', () => {
    expect(verify('Hi! I can review the signed order whenever you are ready.', {
      speechAct: 'social',
    }).errors).toContain('RESP_UNREQUESTED_DOCUMENT_USE');
  });

  it('rejects latent document context on an unrelated current turn', () => {
    expect(verify('If you mean the signed order, upload it and I can review it.', {
      speechAct: 'unknown',
      documentContextAllowed: false,
      plan: plan({ responseAct: 'clarify' }),
    }).errors).toEqual(expect.arrayContaining([
      'RESP_LATENT_DOCUMENT_CONTEXT_SURFACED',
      'RESP_UNREQUESTED_DOCUMENT_USE',
    ]));
  });

  it('rejects the captured file-reference disclaimer on a social turn', () => {
    const content = 'Because right now I can see the file reference/name, but I do not have the actual readable page text in front of me.';
    expect(verify(content, { speechAct: 'social' }).errors)
      .toContain('RESP_DOCUMENT_ANALYSIS_ON_SOCIAL_TURN');
  });

  it('rejects a citation-only document claim on a social turn', () => {
    expect(verify('The controlling language applies here [p. 4].', {
      speechAct: 'social',
    }).errors).toContain('RESP_DOCUMENT_ANALYSIS_ON_SOCIAL_TURN');
  });

  it('recognizes the captured unreadability wording when readable evidence exists', () => {
    const readableSnapshot: DocumentCapabilitySnapshot = {
      ...snapshot,
      documents: [{
        uploadedFileId: 'order-1',
        filename: 'Signed Final Order.pdf',
        status: 'ready',
        authorized: true,
        binaryStored: true,
        metadataAvailable: true,
        textExtracted: true,
        extractedCharacterCount: 5_000,
        pageCountKnown: true,
        pagesTotal: 10,
        availablePageRanges: [[1, 10]],
        requestedPagesAvailable: true,
        chunksAvailable: true,
        activeMemoryAvailable: true,
        keywordSearchAvailable: true,
        semanticSearchAvailable: true,
        hostedFileSearchAvailable: false,
        citationAnchorsAvailable: true,
        coverageStatus: 'complete',
        fullDocumentReviewStatus: 'ready',
        limitations: [],
      }],
    };
    const content = 'I do not have the actual readable page text in front of me, so please paste it here.';
    expect(verify(content, {
      capabilitySnapshot: readableSnapshot,
      capabilityDecision: { ...capabilityDecision, prohibitedClaims: ['file_unreadable'] },
    }).errors).toContain('RESP_FALSE_UNREADABLE_CLAIM');
  });

  it('accepts a brief greeting while retaining document focus outside the response', () => {
    expect(verify('Hi! How can I help?', {
      speechAct: 'social',
      requiresDirectAnswer: true,
    }).passed).toBe(true);
  });

  it('rejects historical analysis and false completion while awaiting a new upload', () => {
    const result = verify('I reviewed the order. The order says the possession clause controls.', {
      requestedOperation: 'await_upload',
      plan: plan({ responseAct: 'status', questionKind: 'status' }),
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      'RESP_AWAITED_INPUT_NOT_ACKNOWLEDGED',
      'RESP_HISTORICAL_DOCUMENT_WHILE_AWAITING_UPLOAD',
      'RESP_FALSE_ACTION_COMPLETION',
      'RESP_FUTURE_ACTION_EXECUTED_EARLY',
      'RESP_INTENT_NOT_FULFILLED',
    ]));
  });

  it('rejects an offer to use a historical document while awaiting the promised upload', () => {
    const result = verify('I can review the prior order now while you prepare the replacement upload.', {
      requestedOperation: 'await_upload',
      plan: plan({ responseAct: 'status', questionKind: 'status' }),
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      'RESP_HISTORICAL_DOCUMENT_WHILE_AWAITING_UPLOAD',
      'RESP_ROUTE_INAPPROPRIATE',
    ]));
  });

  it('rejects passive completion wording while awaiting an upload', () => {
    const result = verify('The extraction is complete. Upload the replacement when ready.', {
      requestedOperation: 'await_upload',
      plan: plan({ responseAct: 'status', questionKind: 'status' }),
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      'RESP_FALSE_ACTION_COMPLETION',
      'RESP_FUTURE_ACTION_EXECUTED_EARLY',
    ]));
  });

  it('rejects citations when the independent citation verifier failed', () => {
    expect(verify('The order sets possession for Friday at 6:00 p.m. [p. 4].', {
      citationVerificationPassed: false,
    }).errors).toContain('RESP_CITATION_MISMATCH');
  });

  it('rejects evidence use outside the execution plan document scope', () => {
    expect(verify('The order sets possession for Friday at 6:00 p.m.', {
      usedDocumentIds: ['old-order'],
      plan: plan({ selectedDocumentIds: ['signed-order'] }),
    }).errors).toEqual(expect.arrayContaining([
      'RESP_WRONG_DOCUMENT_SCOPE',
      'RESP_UNREQUESTED_DOCUMENT_USE',
    ]));
  });

  it('does not allow the candidate response to certify its own proposition', () => {
    const content = 'The order definitely requires an unsupported result that is not in the evidence.';
    expect(verify(content, {
      supportedPropositions: [content],
      requiresDirectAnswer: true,
    }).errors).toContain('RESP_UNSUPPORTED_PROPOSITION');
  });

  it('rejects claimed self-assessment without a server inspection receipt', () => {
    expect(verify('I checked the last response and it was wrong.', {
      speechAct: 'challenge',
      selfCorrectionV2: true,
    }).errors).toContain('RESP_SELF_ASSESSMENT_WITHOUT_INSPECTION');
    expect(verify('I checked the last response and it was wrong.', {
      speechAct: 'challenge',
      selfCorrectionV2: true,
      inspectionReceiptId: 'inspection_1',
    }).errors).not.toContain('RESP_SELF_ASSESSMENT_WITHOUT_INSPECTION');
  });

  it('accepts a specific wait acknowledgment without activating a historical document', () => {
    expect(verify('Sounds good—upload the new file when you are ready, and I will perform a fresh extraction from that copy.', {
      requestedOperation: 'await_upload',
      plan: plan({ responseAct: 'status', questionKind: 'status' }),
    }).passed).toBe(true);
  });

  it('composes narrow deterministic repairs for greetings and promised uploads', () => {
    expect(buildPublicationRepairContent({
      errors: ['RESP_DOCUMENT_ANALYSIS_ON_SOCIAL_TURN'],
      questionKind: 'other',
      stage: 'deterministic_repair',
      speechAct: 'social',
      userMessage: 'hey',
    })).toBe('Hi! How can I help?');
    expect(buildPublicationRepairContent({
      errors: ['RESP_HISTORICAL_DOCUMENT_WHILE_AWAITING_UPLOAD'],
      questionKind: 'status',
      stage: 'deterministic_repair',
      requestedOperation: 'await_upload',
    })).toContain('fresh extraction from that copy');
    expect(buildPublicationRepairContent({
      errors: ['RESP_LATENT_DOCUMENT_CONTEXT_SURFACED'],
      questionKind: 'other',
      stage: 'clarification',
      speechAct: 'unknown',
      userMessage: 'ZQX?',
    })).toBe('What do you mean by “ZQX”?');
  });

  it('allows one v2 regeneration for a non-narrow generic failure and then stops retrying', () => {
    const first = decideRepair({
      errors: ['RESP_GENERIC_WHEN_EVIDENCE_AVAILABLE', 'RESP_GENERIC_MULTI_SENTENCE'],
      attempt: 0,
      hasCanonicalPlan: false,
      hasSupportedPropositions: false,
      ambiguityMaterial: false,
      capabilityAllowed: true,
      publicationV2: true,
    });
    expect(first).toMatchObject({ stage: 'single_regeneration', retryBudgetRemaining: 1 });

    const exhausted = decideRepair({
      errors: ['RESP_GENERIC_WHEN_EVIDENCE_AVAILABLE'],
      attempt: 1,
      hasCanonicalPlan: false,
      hasSupportedPropositions: false,
      ambiguityMaterial: false,
      capabilityAllowed: true,
      publicationV2: true,
    });
    expect(exhausted).toMatchObject({ stage: 'safe_limitation', retryBudgetRemaining: 0 });
  });

  it('mints and revalidates an explicitly versioned v2 publication envelope', () => {
    const envelope = mintPublicationEnvelope({
      turnId: 'turn-1',
      planId: 'plan-1',
      taskId: 'task-1',
      focusRevision: 1,
      responseAct: 'answer',
      content: 'Weekend possession begins Friday at 6:00 p.m.',
      decision: 'publish',
      checks: {
        responsiveness: true,
        evidence: true,
        capabilityClaims: true,
        continuity: true,
        contradictions: true,
        safety: true,
        internalPayload: true,
      },
      capabilitySnapshotHash: 'cap_test',
      evidenceSetHash: 'evidence_test',
      canonicalPlanHash: 'plan_test',
    }, { validatorVersion: PUBLICATION_VALIDATOR_V2_VERSION });
    const persisted = serializePublicationEnvelope(envelope);

    expect(validatePersistedEnvelope({
      envelope: persisted,
      turnId: 'turn-1',
      planId: 'plan-1',
      taskId: 'task-1',
      focusRevision: 1,
      capabilitySnapshotHash: 'cap_test',
      evidenceSetHash: 'evidence_test',
      expectedValidatorVersion: PUBLICATION_VALIDATOR_V2_VERSION,
    })).toEqual({ passed: true, errors: [] });
    expect(validatePersistedEnvelope({
      envelope: persisted,
      turnId: 'turn-1',
      planId: 'plan-1',
      taskId: 'task-1',
      focusRevision: 1,
      capabilitySnapshotHash: 'cap_test',
      evidenceSetHash: 'evidence_test',
    }).errors).toContain('publication_validator_incompatible');
  });
});
