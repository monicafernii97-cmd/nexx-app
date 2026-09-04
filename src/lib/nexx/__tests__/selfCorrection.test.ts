import { describe, expect, it } from 'vitest';
import {
  classifySelfCorrectionContradictions,
  correctionInspectionPrompt,
  planSelfCorrection,
  selfCorrectionTerminalMessage,
  type PriorTurnInspectionReceipt,
} from '../response/selfCorrection';

function receipt(overrides: Partial<PriorTurnInspectionReceipt> = {}): PriorTurnInspectionReceipt {
  return {
    receiptVersion: 1,
    receiptId: 'inspection_1',
    targetMessageId: 'message_1',
    targetTurnId: 'turn_1',
    inspectedAt: 1,
    responseFingerprint: 'response_1',
    foreground: {
      speechAct: 'social',
      routeMode: 'document_analysis',
      selectedDocumentIds: ['order_1'],
      documentActivationActive: true,
    },
    capability: { snapshotHash: 'cap_1', readableDocumentCount: 1 },
    publication: { decision: 'publish', rejectionCodes: [], validatorVersion: 'response-publication-v2' },
    operation: { status: 'completed', retryable: false },
    ...overrides,
  };
}

describe('agentic self-correction', () => {
  it('detects social-route activation and a false unreadable claim from inspected facts', () => {
    const inspected = receipt();
    expect(classifySelfCorrectionContradictions({
      currentSpeechAct: 'challenge',
      priorResponse: 'I cannot read the signed order in this chat.',
      receipt: inspected,
    })).toEqual(expect.arrayContaining([
      'user_challenged_prior_answer',
      'prior_social_document_activation',
      'prior_false_unreadable_claim',
    ]));
  });

  it('selects at most two fixed repair actions', () => {
    expect(planSelfCorrection({
      contradictionCodes: [
        'prior_social_document_activation',
        'prior_false_unreadable_claim',
        'user_challenged_prior_answer',
      ],
    })).toMatchObject({
      actions: ['clear_stale_activation', 'refresh_capabilities'],
      maxActions: 2,
      exhausted: false,
    });
  });

  it('halts repeated fingerprints instead of looping', () => {
    const plan = planSelfCorrection({
      contradictionCodes: ['repeated_response_fingerprint'],
    });
    expect(plan).toMatchObject({ actions: [], exhausted: true, terminalReason: 'loop_detected' });
    expect(selfCorrectionTerminalMessage(plan)).toContain('will not repeat it');
  });

  it('halts when the automatic action budget is exhausted', () => {
    expect(planSelfCorrection({
      contradictionCodes: ['user_challenged_prior_answer'],
      priorAutomaticAttemptCount: 2,
    })).toMatchObject({ actions: [], exhausted: true, terminalReason: 'repair_budget_exhausted' });
  });

  it('builds a receipt-backed prompt without exposing hidden reasoning', () => {
    const inspected = receipt();
    const prompt = correctionInspectionPrompt(inspected, planSelfCorrection({
      contradictionCodes: ['prior_false_unreadable_claim'],
    }));
    expect(prompt).toContain('server-side inspection receipt');
    expect(prompt).toContain('refresh_capabilities');
    expect(prompt).toContain('Do not expose receipt IDs');
    expect(prompt).not.toContain('chain-of-thought');
  });
});
