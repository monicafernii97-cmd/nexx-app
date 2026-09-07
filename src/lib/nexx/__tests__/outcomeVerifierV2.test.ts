import { describe, expect, it } from 'vitest';
import { verifyConversationOutcome } from '../response/outcomeVerifier';

describe('conversation outcome verifier', () => {
  it('rejects the incident fallback regardless of route labels', () => {
    const result = verifyConversationOutcome({
      latestUserGoal: 'What does mediation look like?',
      decision: { kind: 'answer', answer: 'I cannot verify a complete answer from the order language available for this turn.' },
      toolReceipts: [], requiredEvidence: false, evidenceIds: [], authorizedEvidenceIds: new Set(),
    });
    expect(result).toMatchObject({ passed: false, rejectionCodes: ['known_irrelevant_fallback'] });
  });

  it('blocks unauthorized and missing evidence', () => {
    const unauthorized = verifyConversationOutcome({
      latestUserGoal: 'What does my order say?', decision: { kind: 'answer', answer: 'The order says Friday.' },
      toolReceipts: [], requiredEvidence: true, evidenceIds: ['other-tenant-chunk'], authorizedEvidenceIds: new Set(['chunk-1']),
    });
    expect(unauthorized.rejectionCodes).toContain('unauthorized_evidence');

    const missing = verifyConversationOutcome({
      latestUserGoal: 'What does my order say?', decision: { kind: 'answer', answer: 'The order says Friday.' },
      toolReceipts: [], requiredEvidence: true, evidenceIds: [], authorizedEvidenceIds: new Set(),
    });
    expect(missing.rejectionCodes).toContain('required_evidence_missing');
  });

  it('requires an executed evidence receipt for a document-grounded answer', () => {
    const base = {
      latestUserGoal: 'What does my order say?',
      decision: { kind: 'answer' as const, answer: 'I reviewed the order. It says the exchange is Friday.' },
      requiredEvidence: true,
      evidenceIds: ['chunk-1'],
      authorizedEvidenceIds: new Set(['chunk-1']),
    };
    expect(verifyConversationOutcome({ ...base, toolReceipts: [] }).rejectionCodes).toEqual(expect.arrayContaining([
      'required_evidence_receipt_missing',
      'false_document_tool_claim',
    ]));
    expect(verifyConversationOutcome({
      ...base,
      toolReceipts: [{
        toolCallId: 'call-1', toolName: 'read_document_pages', status: 'completed', authorizationScopeHash: 'scope-1',
        resourceIds: ['document-1'], evidenceIds: ['chunk-1'], sideEffect: 'none', startedAt: 1, completedAt: 2,
      }],
    }).passed).toBe(true);
  });

  it('rejects claims about web research or material actions without receipts', () => {
    const common = { latestUserGoal: 'Check and file it', requiredEvidence: false, evidenceIds: [], authorizedEvidenceIds: new Set<string>(), toolReceipts: [] };
    expect(verifyConversationOutcome({
      ...common, decision: { kind: 'answer', answer: 'I searched the web and found the current rule.' },
    }).rejectionCodes).toContain('false_web_tool_claim');
    expect(verifyConversationOutcome({
      ...common, decision: { kind: 'answer', answer: 'I submitted the filing for you.' },
    }).rejectionCodes).toContain('false_material_action_claim');
  });

  it('preserves a natural answer and requests semantic relevance review separately', () => {
    const result = verifyConversationOutcome({
      latestUserGoal: 'What does mediation look like?',
      decision: { kind: 'answer', answer: 'A neutral mediator guides both parties through a structured discussion.' },
      toolReceipts: [], requiredEvidence: false, evidenceIds: [], authorizedEvidenceIds: new Set(),
    });
    expect(result).toMatchObject({ passed: true, requiresSemanticReview: true });
  });
});
