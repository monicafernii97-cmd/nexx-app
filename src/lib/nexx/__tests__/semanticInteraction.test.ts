import { describe, expect, it } from 'vitest';
import { buildExecutionPlan } from '../orchestration/executionPlan';
import { decideDocumentActivation } from '../orchestration/documentActivation';
import { decideFocusTransition } from '../orchestration/focusTransition';
import { createReviewDepthPendingInteraction } from '../orchestration/pendingInteraction';
import { recommendationForOption, resolveSemanticInteraction } from '../orchestration/semanticInteraction';
import { arbitrateSemanticClassifierResult, parseSemanticClassifierResult } from '../orchestration/semanticClassifier';
import { understandTurn } from '../orchestration/turnUnderstanding';
import type { ConversationControlSnapshot } from '../orchestration/types';
import { buildCapabilitySnapshot, canPerformOperation } from '../capabilities/documentCapabilityLedger';
import { verifyResponseClaims } from '../response/claimVerifier';

const documentId = 'signed-order';
const evidenceGenerationId = 'generation-1';
const taskId = 'task-order';

function reviewState(options: { recommend?: boolean; focusRevision?: number } = {}) {
  const focusRevision = options.focusRevision ?? 4;
  const interaction = createReviewDepthPendingInteraction({
    taskId,
    documentIds: [documentId],
    evidenceGenerationIds: [evidenceGenerationId],
    focusRevision,
    sourceTurnId: 'turn-analyze',
    sourcePlanId: 'plan-analyze',
    capabilitySnapshotHash: 'capability-1',
    authorizationScopeHash: 'scope-1',
  });
  const full = interaction.options.find((option) => option.operation?.kind === 'document_review' && option.operation.analysisMode === 'full_document_review')!;
  const control: ConversationControlSnapshot = {
    schemaVersion: 1,
    focusRevision,
    activeTaskId: taskId,
    activeTaskKind: 'document_review',
    activeDocumentIds: [documentId],
    activeEvidenceGenerationIds: [evidenceGenerationId],
    pendingAct: 'select',
    pendingOptions: interaction.options,
    pendingInteractionVersion: 2,
    activeRecommendation: options.recommend
      ? recommendationForOption({ option: full, options: interaction.options, focusRevision, sourceTurnId: 'turn-which', now: 10 })
      : undefined,
    confidence: 1,
    provenance: 'native_v1',
  };
  return { control, full, options: interaction.options };
}

describe('semantic recommendation execution', () => {
  it('resolves the exact production sequence into an executable full-review plan', () => {
    const initial = reviewState();
    const which = understandTurn({ message: 'which', controlState: initial.control });
    expect(which).toMatchObject({ speechAct: 'clarify', interactionIntent: 'ask_about_options' });

    const recommended = reviewState({ recommend: true });
    const message = 'please do so';
    const resolution = resolveSemanticInteraction({ message, controlState: recommended.control, now: 11 })!;
    const understanding = understandTurn({ message, controlState: recommended.control });
    expect(understanding).toMatchObject({
      speechAct: 'confirm',
      interactionIntent: 'accept_recommendation',
      ambiguityMaterial: false,
    });
    expect(understanding.referents[0]).toMatchObject({ resolvedType: 'option', resolvedId: recommended.full.optionId });

    const transition = decideFocusTransition({ message, understanding, controlState: recommended.control });
    const activation = decideDocumentActivation({
      message,
      speechAct: understanding.speechAct,
      requestedOperation: understanding.requestedOperation,
      detection: { referencesDocument: false, confidence: 'none' },
      pendingAct: recommended.control.pendingAct,
      hasCurrentAttachments: false,
      hasActiveDocumentContext: true,
      hasPendingDocumentAction: true,
    });
    expect(activation).toMatchObject({ active: true, source: 'pending_action' });

    const plan = buildExecutionPlan({
      message,
      understanding,
      transition,
      taskId,
      focusRevision: 5,
      routeMode: 'document_analysis',
      activeDocumentIds: [documentId],
      activeEvidenceGenerationIds: [evidenceGenerationId],
      documentActivation: activation,
      resolvedOption: recommended.full,
      interactionResolutionId: resolution.resolutionId,
    });
    expect(plan).toMatchObject({
      interactionResolutionId: resolution.resolutionId,
      selectedOptionId: recommended.full.optionId,
      requestedOperation: 'document_review',
      analysisMode: 'full_document_review',
      selectedDocumentIds: [documentId],
      selectedEvidenceGenerationIds: [evidenceGenerationId],
    });
  });

  it.each([
    'please do so',
    'do that',
    'go with that',
    'go ahead',
    'okay then',
    'use your recommendation',
    'the one you think is best',
    'that sounds good',
    "I'm happy to follow your judgment",
    "let's take the route you favor",
    'yea do taht pls',
  ])('understands recommendation acceptance by meaning: %s', (message) => {
    const { control, full } = reviewState({ recommend: true });
    expect(resolveSemanticInteraction({ message, controlState: control, now: 11 })).toMatchObject({
      decision: 'execute',
      selectedOptionId: full.optionId,
    });
  });

  it.each([
    'Should I do that?',
    'I do not want that',
    'please do something else',
    'Thanks for your recommendation',
  ])('does not execute a conversational near-miss: %s', (message) => {
    const { control } = reviewState({ recommend: true });
    expect(resolveSemanticInteraction({ message, controlState: control })).not.toMatchObject({ decision: 'execute' });
  });

  it('clarifies generic acceptance when two options exist without a recommendation', () => {
    const { control } = reviewState();
    expect(resolveSemanticInteraction({ message: 'go ahead', controlState: control })).toMatchObject({
      intent: 'uncertain',
      decision: 'clarify',
      reasonCodes: ['generic_acceptance_multiple_options_without_recommendation'],
    });
  });

  it('lets an explicit option override the recommendation', () => {
    const { control, options } = reviewState({ recommend: true });
    const focused = options.find((option) => option.operation?.kind === 'document_review' && option.operation.analysisMode === 'focused_question')!;
    expect(resolveSemanticInteraction({ message: 'go with the focused review', controlState: control })).toMatchObject({
      intent: 'select_option',
      decision: 'execute',
      selectedOptionId: focused.optionId,
    });
  });

  it('does not turn negation into acceptance', () => {
    const { control, full } = reviewState({ recommend: true });
    expect(resolveSemanticInteraction({ message: 'not the full document review', controlState: control })).toMatchObject({
      intent: 'reject_recommendation',
      decision: 'rejected',
      selectedOptionId: full.optionId,
    });
  });

  it('retains document focus silently for social and opaque turns', () => {
    const { control } = reviewState({ recommend: true });
    expect(resolveSemanticInteraction({ message: 'hey', controlState: control })).toBeUndefined();
    expect(resolveSemanticInteraction({ message: 'ZQX?', controlState: control })).toBeUndefined();
  });

  it('defers execution for a promised future upload', () => {
    const { control } = reviewState({ recommend: true });
    expect(resolveSemanticInteraction({ message: 'I will reupload the signed order', controlState: control })).toMatchObject({
      intent: 'defer_action',
      decision: 'defer',
      reasonCodes: ['awaiting_future_upload'],
    });
  });

  it('does not execute a recommendation from a stale focus revision', () => {
    const { control } = reviewState({ recommend: true });
    control.focusRevision += 1;
    expect(resolveSemanticInteraction({ message: 'please do so', controlState: control })).toMatchObject({
      intent: 'uncertain',
      decision: 'clarify',
    });
  });

  it('does not treat a quotation of an old offer as acceptance', () => {
    const { control } = reviewState({ recommend: true });
    expect(resolveSemanticInteraction({ message: 'You said “go with the full review” yesterday.', controlState: control })).toBeUndefined();
  });

  it('rejects the exact false-unavailability production wording after acceptance', () => {
    const { control, full } = reviewState({ recommend: true });
    const message = 'please do so';
    const understanding = understandTurn({ message, controlState: control });
    const transition = decideFocusTransition({ message, understanding, controlState: control });
    const activation = decideDocumentActivation({
      message,
      speechAct: understanding.speechAct,
      detection: { referencesDocument: false, confidence: 'none' },
      pendingAct: 'select',
      hasCurrentAttachments: false,
      hasActiveDocumentContext: true,
      hasPendingDocumentAction: true,
    });
    const plan = buildExecutionPlan({
      message, understanding, transition, taskId, focusRevision: 5,
      routeMode: 'document_analysis', activeDocumentIds: [documentId],
      activeEvidenceGenerationIds: [evidenceGenerationId], documentActivation: activation,
      resolvedOption: full,
    });
    const snapshot = buildCapabilitySnapshot({
      turnId: 'turn-accept',
      documents: [{
        uploadedFileId: documentId,
        filename: 'Signed Final Order.pdf',
        status: 'ready',
        authorized: true,
        extractedTextLength: 50_000,
        chunkCount: 33,
        hasKeywordSearch: true,
        hasCitationAnchors: true,
        coverageStatus: 'complete',
        fullDocumentReviewStatus: 'ready',
        availablePageRanges: [[1, 46]],
      }],
    });
    const verification = verifyResponseClaims({
      content: 'I do not have the signed order text available to read in this chat. Please reupload the signed order file.',
      plan,
      capabilitySnapshot: snapshot,
      capabilityDecision: canPerformOperation('exhaustive_review', snapshot),
      evidenceIds: [],
      expectedFocusRevision: 5,
      currentFocusRevision: 5,
      publicationV2: true,
      speechAct: understanding.speechAct,
      documentContextAllowed: true,
      usedDocumentIds: [],
    });
    expect(verification.errors).toEqual(expect.arrayContaining([
      'RESP_SELECTED_DOCUMENT_FALSE_UNAVAILABLE',
      'RESP_REUPLOAD_UNNECESSARY',
      'RESP_ACCEPTED_ACTION_NOT_EXECUTED',
      'RESP_EXECUTION_WITHOUT_EVIDENCE',
    ]));
  });

  it('allows a structured classifier paraphrase to select only the current recommendation', () => {
    const { control, full, options } = reviewState({ recommend: true });
    const resolution = arbitrateSemanticClassifierResult({
      message: 'I trust your call—carry on with it',
      options,
      recommendation: control.activeRecommendation,
      classification: {
        intent: 'accept_recommendation',
        candidates: [{ optionId: full.optionId, score: 0.97 }],
        modifiers: [],
        confidence: 0.95,
        reasonCodes: ['paraphrased_assent'],
      },
    });
    expect(resolution).toMatchObject({
      decision: 'execute',
      intent: 'accept_recommendation',
      selectedOptionId: full.optionId,
      documentIds: [documentId],
      evidenceGenerationIds: [evidenceGenerationId],
    });
  });

  it('fails closed for unknown option IDs, weak margins, and modifiers', () => {
    const { control, full, options } = reviewState({ recommend: true });
    for (const classification of [
      { intent: 'accept_recommendation' as const, candidates: [{ optionId: 'invented', score: 0.99 }], modifiers: [], confidence: 0.99, reasonCodes: [] },
      { intent: 'select_option' as const, candidates: options.map((option) => ({ optionId: option.optionId, score: option.optionId === full.optionId ? 0.8 : 0.72 })), modifiers: [], confidence: 0.9, reasonCodes: [] },
      { intent: 'accept_recommendation' as const, candidates: [{ optionId: full.optionId, score: 0.99 }], modifiers: ['but skip support'], confidence: 0.99, reasonCodes: [] },
    ]) {
      expect(arbitrateSemanticClassifierResult({ message: 'ambiguous', options, recommendation: control.activeRecommendation, classification })).toMatchObject({ decision: 'clarify' });
    }
  });

  it('rejects invalid structured classifier output', () => {
    expect(parseSemanticClassifierResult({
      intent: 'invented_action', candidates: [], modifiers: [], confidence: 2, reasonCodes: [],
    })).toBeNull();
  });
});
