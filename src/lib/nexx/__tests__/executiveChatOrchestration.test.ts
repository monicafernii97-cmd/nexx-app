import { describe, expect, it } from 'vitest';
import { buildCapabilitySnapshot, canPerformOperation } from '../capabilities/documentCapabilityLedger';
import { buildExecutionPlan } from '../orchestration/executionPlan';
import { decideFocusTransition } from '../orchestration/focusTransition';
import { derivePendingInteraction } from '../orchestration/pendingInteraction';
import type { ConversationControlSnapshot, PendingOption } from '../orchestration/types';
import { understandTurn } from '../orchestration/turnUnderstanding';
import { verifyResponseClaims } from '../response/claimVerifier';
import { mintPublicationEnvelope, serializePublicationEnvelope, validatePersistedEnvelope } from '../response/publicationContract';
import { buildPublicationRepairContent, decideRepair } from '../response/repairPolicy';
import { buildCanonicalAnswerPlanV2, verifyCanonicalAnswerPlanV2 } from '../legal-engine/canonicalAnswerPlan';

const orderId = 'order-1';
const taskId = 'task-order';

function control(overrides: Partial<ConversationControlSnapshot> = {}): ConversationControlSnapshot {
  return {
    schemaVersion: 1,
    focusRevision: 3,
    activeTaskId: taskId,
    activeTaskKind: 'document_review',
    activeDocumentIds: [orderId],
    activeEvidenceGenerationIds: [],
    pendingOptions: [],
    confidence: 0.9,
    provenance: 'native_v1',
    ...overrides,
  };
}

function option(overrides: Partial<PendingOption> = {}): PendingOption {
  return {
    optionId: 'focused-review',
    label: 'focused review',
    aliases: ['focused', 'the first one'],
    action: 'select_scope',
    targetTaskId: taskId,
    documentIds: [orderId],
    expiresAfterFocusRevision: 3,
    ...overrides,
  };
}

describe('executive chat turn understanding', () => {
  it('persists structured choices from a human-readable assistant question', () => {
    const pending = derivePendingInteraction({
      content: 'Which review would help: focused terms, deadlines, custody/possession, or exhaustive review?',
      taskId,
      documentIds: [orderId],
      focusRevision: 3,
    });
    expect(pending.pendingAct).toBe('select');
    expect(pending.options.map((item) => item.label)).toEqual([
      'focused terms', 'deadlines', 'custody/possession', 'exhaustive review',
    ]);
    expect(pending.options.every((item) => item.targetTaskId === taskId && item.documentIds.includes(orderId))).toBe(true);
  });

  it('persists a single confirmable assistant offer', () => {
    const pending = derivePendingInteraction({
      content: 'I can perform the focused review now. Would you like me to proceed?',
      taskId,
      documentIds: [orderId],
      focusRevision: 3,
    });
    expect(pending.pendingAct).toBe('confirm');
    expect(pending.options).toHaveLength(1);
    expect(pending.offer).toMatchObject({ targetTaskId: taskId, documentIds: [orderId] });
  });

  it.each(['which', 'why', 'huh?', 'what do you mean'])('preserves focus for ambiguous clarification %s', (message) => {
    const understanding = understandTurn({ message, controlState: control() });
    const transition = decideFocusTransition({ message, understanding, controlState: control() });
    expect(understanding.continuity).toBe('same_task');
    expect(['retain', 'clarify', 'refine']).toContain(transition.kind);
    expect(transition.kind).not.toBe('replace');
  });

  it.each(['please do so', 'do it', 'yes', 'okay', 'sure'])('resolves confirmation %s against one pending offer', (message) => {
    const state = control({
      pendingAct: 'confirm',
      lastAssistantOffer: {
        act: 'confirm',
        object: 'perform the focused review',
        targetTaskId: taskId,
        documentIds: [orderId],
      },
    });
    const understanding = understandTurn({ message, controlState: state });
    const transition = decideFocusTransition({ message, understanding, controlState: state });
    expect(understanding.speechAct).toBe('confirm');
    expect(transition).toMatchObject({ kind: 'refine', taskId });
  });

  it('lets a single pending offer resolve confirmation even when older tasks score similarly', () => {
    const state = control({
      pendingAct: 'confirm',
      lastAssistantOffer: {
        act: 'confirm', object: 'perform the focused review', targetTaskId: taskId, documentIds: [orderId],
      },
    });
    const understanding = understandTurn({
      message: 'please do so',
      controlState: state,
      activeTasks: [
        { taskId, kind: 'document_review', status: 'active', goal: 'review order', normalizedGoal: 'review order', documentIds: [orderId], evidenceGenerationIds: [] },
        { taskId: 'older-task', kind: 'document_review', status: 'waiting_user', goal: 'review order', normalizedGoal: 'review order', documentIds: [orderId], evidenceGenerationIds: [] },
      ],
    });
    expect(understanding.speechAct).toBe('confirm');
    expect(understanding.ambiguityMaterial).toBe(false);
    expect(understanding.reasonCodes).toContain('confirmation_resolved_by_pending_offer');
  });

  it('selects a pending option by alias without losing its document', () => {
    const state = control({ pendingAct: 'select', pendingOptions: [option()] });
    const understanding = understandTurn({ message: 'the first one', controlState: state });
    expect(understanding.speechAct).toBe('select');
    expect(understanding.referents[0]).toMatchObject({ resolvedType: 'option', resolvedId: 'focused-review' });
    const transition = decideFocusTransition({ message: 'the first one', understanding, controlState: state });
    expect(transition).toMatchObject({ kind: 'refine', taskId, patch: { selectedOptionId: 'focused-review' } });
  });

  it('clarifies rather than guessing between materially ambiguous options', () => {
    const state = control({
      pendingAct: 'select',
      pendingOptions: [
        option({ optionId: 'a', label: 'focused review', aliases: ['review'] }),
        option({ optionId: 'b', label: 'exhaustive review', aliases: ['review'] }),
      ],
    });
    const understanding = understandTurn({ message: 'review', controlState: state });
    const transition = decideFocusTransition({ message: 'review', understanding, controlState: state });
    expect(understanding.ambiguityMaterial).toBe(true);
    expect(transition.kind).toBe('clarify');
  });

  it('allows an explicit topic switch to replace focus while retaining previous task identity', () => {
    const state = control();
    const message = 'Switch topics: help me prepare for mediation';
    const understanding = understandTurn({ message, controlState: state });
    const transition = decideFocusTransition({ message, understanding, controlState: state });
    expect(understanding.continuity).toBe('new_task');
    expect(transition).toMatchObject({ kind: 'replace', previousTaskId: taskId });
  });

  it('resolves the only active document from a pronoun', () => {
    const understanding = understandTurn({
      message: 'what does it say?',
      controlState: control(),
      activeDocumentDescriptors: [{ uploadedFileId: orderId, filename: 'Signed Final Order.pdf' }],
    });
    expect(understanding.referents).toContainEqual(expect.objectContaining({ resolvedType: 'document', resolvedId: orderId }));
  });
});

describe('operation-aware document capability', () => {
  const snapshot = buildCapabilitySnapshot({
    turnId: 'turn-1',
    documents: [{
      uploadedFileId: orderId,
      filename: 'Signed Final Order.pdf',
      status: 'ready',
      authorized: true,
      hasStorageId: true,
      extractedTextLength: 102_270,
      pagesTotal: 46,
      availablePageRanges: [[1, 46]],
      chunkCount: 33,
      hasActiveMemory: true,
      hasKeywordSearch: true,
      hasSemanticSearch: true,
      hasCitationAnchors: true,
      coverageStatus: 'complete',
      fullDocumentReviewStatus: 'failed',
    }],
  });

  it('keeps focused work available when exhaustive review failed', () => {
    expect(canPerformOperation('answer_focused_question', snapshot)).toMatchObject({ allowed: true });
    expect(canPerformOperation('scoped_summary', snapshot)).toMatchObject({ allowed: true });
    expect(canPerformOperation('search_document', snapshot)).toMatchObject({ allowed: true });
    expect(canPerformOperation('exhaustive_review', snapshot)).toMatchObject({
      allowed: false,
      missingRequirements: expect.arrayContaining(['ready_full_document_review']),
      alternateOperations: expect.arrayContaining(['answer_focused_question', 'scoped_summary']),
    });
  });

  it('prohibits both false unreadability and false exhaustive claims', () => {
    const decision = canPerformOperation('answer_focused_question', snapshot);
    expect(decision.prohibitedClaims).toEqual(expect.arrayContaining(['file_unreadable', 'exhaustive_review_complete']));
  });

  it('produces stable hashes independent of the computed timestamp', () => {
    const again = buildCapabilitySnapshot({
      turnId: 'turn-1',
      computedAt: Date.now() + 50_000,
      documents: [{
        uploadedFileId: orderId,
        filename: 'Signed Final Order.pdf',
        status: 'ready', authorized: true, hasStorageId: true,
        extractedTextLength: 102_270, pagesTotal: 46, availablePageRanges: [[1, 46]],
        chunkCount: 33, hasActiveMemory: true, hasKeywordSearch: true,
        hasSemanticSearch: true, hasCitationAnchors: true,
        coverageStatus: 'complete', fullDocumentReviewStatus: 'failed',
      }],
    });
    expect(again.snapshotHash).toBe(snapshot.snapshotHash);
  });
});

describe('metadata-only document receipt operations', () => {
  it('plans receipt confirmation without inventing a text citation requirement', () => {
    const state = control();
    const message = 'Confirm that you received this synthetic test document in one short sentence.';
    const understanding = understandTurn({ message, controlState: state });
    const transition = decideFocusTransition({ message, understanding, controlState: state });
    const plan = buildExecutionPlan({
      message, understanding, transition, taskId, focusRevision: 3,
      routeMode: 'document_analysis', activeDocumentIds: [orderId],
    });
    expect(understanding.requestedOperation).toBe('document_capability');
    expect(plan.questionKind).toBe('capability');
    expect(plan.evidenceRequirements).toEqual(['authorized_document']);
    expect(plan.capabilityRequirements).toEqual(['document_metadata']);
  });
});

describe('hard response publication contract', () => {
  const state = control({ pendingAct: 'confirm' });
  const understanding = understandTurn({ message: 'please do so', controlState: state });
  const transition = decideFocusTransition({ message: 'please do so', understanding, controlState: state });
  const plan = buildExecutionPlan({
    message: 'please do so',
    understanding,
    transition,
    taskId,
    focusRevision: state.focusRevision,
    routeMode: 'document_analysis',
    activeDocumentIds: [orderId],
  });
  const snapshot = buildCapabilitySnapshot({
    turnId: 'turn-1',
    documents: [{
      uploadedFileId: orderId, filename: 'Signed Final Order.pdf', status: 'ready', authorized: true,
      extractedTextLength: 1_000, chunkCount: 3, hasKeywordSearch: true, hasCitationAnchors: true,
      coverageStatus: 'complete', fullDocumentReviewStatus: 'failed', availablePageRanges: [[1, 3]],
    }],
  });
  const decision = canPerformOperation('answer_focused_question', snapshot);

  it('turns a generic open-analysis answer into explicit persistent choices', () => {
    const content = buildPublicationRepairContent({
      errors: ['RESP_GENERIC_WHEN_EVIDENCE_AVAILABLE'],
      questionKind: 'open_analysis',
      supported: 'This order contains the following relevant provisions.',
      stage: 'deterministic_repair',
    });
    const pending = derivePendingInteraction({ content, taskId, documentIds: [orderId], focusRevision: 3 });
    expect(content).toContain('focused review');
    expect(content).toContain('full-document review');
    expect(pending.pendingAct).toBe('select');
    expect(pending.options).toHaveLength(2);
  });

  it('maps provider-safe source aliases back to authorized canonical chunk IDs', () => {
    const canonical = buildCanonicalAnswerPlanV2({
      executionPlan: plan,
      response: {
        message: 'The order sets out a supported possession term.',
        legalInterpretation: {
          directAnswer: 'The order sets out a supported possession term.',
          controllingClauses: [{ label: 'Possession', quote: 'The supported clause text.', sourceIds: ['src_001'] }],
          interactingClauses: [],
        },
      } as never,
      evidenceIds: ['chunk-1'],
      sourceEvidenceMap: { src_001: 'chunk-1' },
      capabilityDecision: decision,
    });

    expect(canonical.propositions.find((item) => item.propositionId === 'controlling_1')?.evidenceIds).toEqual(['chunk-1']);
    expect(verifyCanonicalAnswerPlanV2({ plan: canonical, authorizedEvidenceIds: ['chunk-1'] })).toEqual({
      passed: true,
      errors: [],
    });
  });

  it('rejects a false unreadability draft before commit', () => {
    const verification = verifyResponseClaims({
      content: 'I cannot read the order in this chat, so please paste the pages.',
      plan,
      capabilitySnapshot: snapshot,
      capabilityDecision: decision,
      evidenceIds: ['chunk-1'],
      expectedFocusRevision: 3,
      currentFocusRevision: 3,
    });
    expect(verification.passed).toBe(false);
    expect(verification.errors).toContain('RESP_FALSE_UNREADABLE_CLAIM');
    expect(decideRepair({
      errors: verification.errors,
      attempt: 0,
      hasCanonicalPlan: true,
      hasSupportedPropositions: true,
      ambiguityMaterial: false,
      capabilityAllowed: true,
    }).stage).toBe('rerender');
  });

  it('rejects a false exhaustive claim while full review is failed', () => {
    const verification = verifyResponseClaims({
      content: 'I reviewed the entire order and there is no other relevant language.',
      plan,
      capabilitySnapshot: snapshot,
      capabilityDecision: decision,
      evidenceIds: ['chunk-1'],
      expectedFocusRevision: 3,
      currentFocusRevision: 3,
    });
    expect(verification.errors).toContain('RESP_FALSE_EXHAUSTIVE_CLAIM');
  });

  it('mints and revalidates an envelope only after every check passes', () => {
    expect(() => mintPublicationEnvelope({
      turnId: 'turn-1', planId: plan.planId, taskId, focusRevision: 3,
      responseAct: 'answer', content: 'Supported scoped answer.', decision: 'publish_scoped',
      checks: { responsiveness: true, evidence: true, capabilityClaims: false, continuity: true, contradictions: true, safety: true, internalPayload: true },
      capabilitySnapshotHash: snapshot.snapshotHash, evidenceSetHash: 'evidence-1', canonicalPlanHash: 'canonical-1',
    })).toThrow('publication_checks_failed');

    const envelope = mintPublicationEnvelope({
      turnId: 'turn-1', planId: plan.planId, taskId, focusRevision: 3,
      responseAct: 'answer', content: 'Supported scoped answer.', decision: 'publish_scoped',
      checks: { responsiveness: true, evidence: true, capabilityClaims: true, continuity: true, contradictions: true, safety: true, internalPayload: true },
      capabilitySnapshotHash: snapshot.snapshotHash, evidenceSetHash: 'evidence-1', canonicalPlanHash: 'canonical-1',
    });
    expect(validatePersistedEnvelope({
      envelope: serializePublicationEnvelope(envelope),
      turnId: 'turn-1', planId: plan.planId, taskId, focusRevision: 3,
      capabilitySnapshotHash: snapshot.snapshotHash, evidenceSetHash: 'evidence-1',
    })).toEqual({ passed: true, errors: [] });
  });

  it('rejects a stale focus revision at both verifier and envelope boundary', () => {
    const verification = verifyResponseClaims({
      content: 'This is a sufficiently direct supported answer.',
      plan,
      capabilitySnapshot: snapshot,
      capabilityDecision: decision,
      evidenceIds: ['chunk-1'],
      expectedFocusRevision: 3,
      currentFocusRevision: 4,
    });
    expect(verification.errors).toContain('RESP_STALE_FOCUS');
  });
});
