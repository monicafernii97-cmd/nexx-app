import { describe, expect, it } from 'vitest';
import {
  assessRecoveryPublication,
  buildContextualRecoveryContent,
  type RecoveryConversationContext,
} from '../response/recoveryPublication';

function build(context: RecoveryConversationContext, recoveryCode: 'provider_unavailable' | 'validation_exhausted' = 'provider_unavailable') {
  const content = buildContextualRecoveryContent({ recoveryCode, context });
  return { content, assessment: assessRecoveryPublication({ content, context }) };
}

describe('recovery publication', () => {
  it('answers a greeting without exposing silent document focus', () => {
    const result = build({ latestUserMessage: 'hey', speechAct: 'social', documentContextActive: true });
    expect(result.content).toBe('Hi! What would you like help with?');
    expect(result.assessment.passed).toBe(true);
  });

  it('waits for a promised reupload instead of analyzing an older file', () => {
    const result = build({ latestUserMessage: 'I will reupload', requestedOperation: 'await_upload', documentContextActive: true });
    expect(result.content).toContain('fresh extraction');
    expect(result.assessment.passed).toBe(true);
  });

  it('publishes a contextual saved-evidence recovery for an order request', () => {
    const result = build({ latestUserMessage: 'Analyze the signed order', documentContextActive: true });
    expect(result.content).toContain('retrieved the order');
    expect(result.content).toContain('saved evidence');
    expect(result.assessment.passed).toBe(true);
  });

  it('keeps an authorized terse continuation on the document task', () => {
    const result = build({ latestUserMessage: 'please do so', speechAct: 'confirm', documentContextActive: true });
    expect(result.content).toContain('saved evidence');
    expect(result.assessment).toMatchObject({ passed: true, contextKind: 'document' });
  });

  it('rejects an order-pinned recovery on a general turn and a false scheduled-retry claim', () => {
    expect(assessRecoveryPublication({
      content: 'I retrieved the order. I’m retrying it now.',
      context: { latestUserMessage: 'hey', speechAct: 'social', documentContextActive: false },
    }).rejectionCodes).toEqual(expect.arrayContaining([
      'recovery_social_context_mismatch',
      'recovery_unrequested_document_reference',
      'recovery_claims_unscheduled_retry',
    ]));
  });
});
