import { describe, expect, it } from 'vitest';
import {
  deriveExecutiveChatMetrics,
  type OperationalTurnContext,
} from '../../../../convex/lib/executiveChatMetrics';

function context(overrides: Partial<OperationalTurnContext> & {
  id: string;
  createdAt: number;
}): OperationalTurnContext {
  return {
    turn: {
      id: overrides.id,
      conversationId: 'conversation-1',
      requestId: `request-${overrides.id}`,
      status: 'assistant_saved',
      outcomeType: 'answered',
      createdAt: overrides.createdAt,
      ...overrides.turn,
    },
    selectedDocumentIds: [],
    conversationProvenance: 'production',
    selectedDocumentProvenances: [],
    ...overrides,
  };
}

describe('executive chat operational metrics', () => {
  it('measures natural flow, clarification resolution, topic changes, and task resumes', () => {
    const metrics = deriveExecutiveChatMetrics({
      contexts: [
        context({ id: 'clarify', createdAt: 1, turn: { id: 'clarify', conversationId: 'conversation-1', requestId: 'r1', status: 'clarification_saved', outcomeType: 'clarified', createdAt: 1 } }),
        context({ id: 'resolved', createdAt: 2 }),
        context({ id: 'switch', createdAt: 3, speechAct: 'switch_topic' }),
        context({
          id: 'resume', createdAt: 4, requestedOperation: 'resume_background_task',
          turn: { id: 'resume', conversationId: 'conversation-1', requestId: 'r4', status: 'assistant_saved', outcomeType: 'answered', taskTransitionsJson: '[{"from":"suspended","to":"open"}]', createdAt: 4 },
        }),
      ],
      publications: [],
      attempts: [],
      toolReceipts: [],
    });

    expect(metrics.directAnswers).toBe(3);
    expect(metrics.clarificationRate).toBe(0.25);
    expect(metrics.clarificationResolutionRate).toBe(1);
    expect(metrics.topicSwitchSuccessRate).toBe(1);
    expect(metrics.backgroundTaskResumeSuccessRate).toBe(1);
  });

  it('detects document false positives, isolation failures, and authorization rejections', () => {
    const metrics = deriveExecutiveChatMetrics({
      contexts: [context({
        id: 'bad-doc', createdAt: 1, speechAct: 'social',
        documentActivationJson: '{"active":true,"source":"explicit_reference"}',
        selectedDocumentIds: ['qa-document'],
        selectedDocumentProvenances: ['synthetic'],
      })],
      publications: [],
      attempts: [],
      toolReceipts: [{ turnId: 'bad-doc', status: 'rejected', failureCode: 'resource_outside_scope' }],
    });

    expect(metrics.falseDocumentActivations).toBe(1);
    expect(metrics.documentActivationPrecision).toBe(0);
    expect(metrics.qaProductionIsolationViolations).toBe(1);
    expect(metrics.unauthorizedResourceRejections).toBe(1);
  });

  it('surfaces prohibited published outcomes and unconfirmed material side effects', () => {
    const metrics = deriveExecutiveChatMetrics({
      contexts: [context({ id: 'unsafe', createdAt: 1 })],
      publications: [
        { turnId: 'unsafe', envelopeId: 'e1', decision: 'publish', rejectionCodes: [], shadowRejectionCodes: ['unauthorized_evidence'] },
        { turnId: 'unsafe', envelopeId: 'e2', decision: 'publish', rejectionCodes: ['required_evidence_receipt_missing'] },
        { turnId: 'unsafe', envelopeId: 'e3', decision: 'publish', rejectionCodes: ['false_material_action_claim'] },
      ],
      attempts: [],
      toolReceipts: [{ turnId: 'unsafe', status: 'completed', sideEffect: 'material' }],
    });

    expect(metrics.unauthorizedEvidencePublications).toBe(1);
    expect(metrics.zeroDocumentAnalysisPublications).toBe(1);
    expect(metrics.falseToolOrActionClaimPublications).toBe(1);
    expect(metrics.materialSideEffectsWithoutConfirmation).toBe(1);
  });

  it('measures stream recovery, successful cost, tools, and idempotency violations', () => {
    const metrics = deriveExecutiveChatMetrics({
      contexts: [
        context({ id: 'turn-1', createdAt: 1 }),
        context({ id: 'turn-2', createdAt: 2, turn: { id: 'turn-2', conversationId: 'conversation-1', requestId: 'request-turn-1', status: 'assistant_saved', outcomeType: 'answered', createdAt: 2 } }),
      ],
      publications: [
        { turnId: 'turn-1', envelopeId: 'envelope-1', decision: 'publish', rejectionCodes: [] },
        { turnId: 'turn-1', envelopeId: 'envelope-2', decision: 'publish', rejectionCodes: [] },
        { turnId: 'turn-2', envelopeId: 'envelope-2', decision: 'publish', rejectionCodes: [] },
      ],
      attempts: [
        { turnId: 'turn-1', attemptNumber: 1, strategy: 'full', status: 'failed', incompleteReason: 'network_interrupted', estimatedCostMicrousd: 100 },
        { turnId: 'turn-1', attemptNumber: 2, strategy: 'continue', status: 'completed', estimatedCostMicrousd: 900 },
      ],
      toolReceipts: [{ turnId: 'turn-1', status: 'completed' }],
    });

    expect(metrics.streamInterruptions).toBe(1);
    expect(metrics.streamRecoveryRate).toBe(1);
    expect(metrics.toolCallsPerSuccessfulTurn).toBe(0.5);
    expect(metrics.taskIdempotencyViolations).toBe(1);
    expect(metrics.publicationIdempotencyViolations).toBe(2);
    expect(metrics.costPerSuccessfulOutcomeUsd).toBe(0.00045);
  });

  it('separates real production turns from QA and synthetic turns', () => {
    const metrics = deriveExecutiveChatMetrics({
      contexts: [
        context({ id: 'real', createdAt: 1 }),
        context({ id: 'qa', createdAt: 2, conversationProvenance: 'qa' }),
        context({ id: 'synthetic', createdAt: 3, conversationProvenance: 'synthetic' }),
      ],
      publications: [], attempts: [], toolReceipts: [],
    });

    expect(metrics.realProductionTurns).toBe(1);
    expect(metrics.syntheticQaTurns).toBe(2);
  });
});
