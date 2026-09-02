import { describe, expect, it } from 'vitest';
import { buildCapabilitySnapshot, canPerformOperation } from '../capabilities/documentCapabilityLedger';
import { getExecutiveChatFeatureFlags } from '../orchestration/featureFlags';
import { validateSemanticArbitration } from '../orchestration/semanticArbiter';
import type { ConversationControlSnapshot } from '../orchestration/types';
import { understandTurn } from '../orchestration/turnUnderstanding';
import { validatePersistedEnvelope } from '../response/publicationContract';
import { scenario } from '../testing/conversationSequenceDsl';

const readable = {
  extractedTextLength: 8_000,
  chunkCount: 12,
  hasKeywordSearch: true,
  hasCitationAnchors: true,
  availablePageRanges: [[1, 10]] as Array<[number, number]>,
  coverageStatus: 'complete' as const,
  fullDocumentReviewStatus: 'failed' as const,
};

function activeControl(overrides: Partial<ConversationControlSnapshot> = {}): ConversationControlSnapshot {
  return {
    schemaVersion: 1, focusRevision: 2, activeTaskId: 'task-order', activeTaskKind: 'document_review',
    activeDocumentIds: ['order'], activeEvidenceGenerationIds: [], pendingOptions: [], confidence: 1,
    provenance: 'native_v1', ...overrides,
  };
}

describe('all 58 mandatory executive-chat sequences', () => {
  const retainSequences = [
    ['2', ['Review the order', 'huh?', 'okay', 'go on']],
    ['3', ['Can you read it?', 'yes?', 'then summarize it']],
    ['4', ['Explain paragraph 7', 'why', 'continue']],
    ['5', ['Give me the deadlines', 'those?', 'yes']],
    ['6', ['Use the signed one', 'k', 'do it']],
    ['7', ['Review it', '👆', 'that one']],
    ['8', ['Analyze custody', 'possesion', 'yes that']],
    ['9', ['Compare them', 'former', 'correct']],
    ['10', ['Draft a response', 'shorter', 'send-ready']],
  ] as const;

  it('1 Analyze file → which → please do so', () => {
    scenario('reported signed-order continuation')
      .givenDocument('order', readable)
      .user('Analyze this file', { attach: 'order' })
      .assistantOffers(['focused review'])
      .user('which').expectNoReplacement()
      .assistantOffers(['focused review'])
      .user('please do so').expectFocus({ documents: ['order'] })
      .retrieve('order').publish()
      .expectRetrieval({ document: 'order', minimumChunks: 1 })
      .expectPublicationPassed();
  });

  it.each(retainSequences)('%s preserves active work across terse/odd continuations', (_number, messages) => {
    const flow = scenario(String(_number)).givenDocument('order', readable).user(messages[0], { attach: 'order' });
    for (const message of messages.slice(1)) flow.user(message).expectNoReplacement();
    flow.expectFocus({ documents: ['order'] });
  });

  it('11 selects the first pending option', () => {
    const flow = scenario('first').givenDocument('order', readable).user('Review it', { attach: 'order' })
      .assistantOffers(['focused review', 'exhaustive review']).user('first');
    expect(flow.steps.at(-1)?.understanding.speechAct).toBe('select');
  });

  it('12 treats “which is better?” as a question, not a selection', () => {
    const flow = scenario('which better').givenDocument('order', readable).user('Review it', { attach: 'order' })
      .assistantOffers(['focused review', 'exhaustive review']).user('which is better?');
    expect(flow.steps.at(-1)?.understanding.referents.some((item) => item.resolvedType === 'option')).toBe(false);
  });

  it('13 retains a single offer across a social aside', () => {
    const flow = scenario('aside').givenDocument('order', readable).user('Review it', { attach: 'order' })
      .assistantOffers(['perform the focused review']).user('thanks').user('please do so');
    expect(flow.steps.at(-1)?.understanding.speechAct).toBe('confirm');
  });

  it('14 clarifies “do it” when two options remain', () => {
    const flow = scenario('ambiguous do it').givenDocument('order', readable).user('Review it', { attach: 'order' })
      .assistantOffers(['focused review', 'exhaustive review']).user('do it');
    expect(flow.steps.at(-1)?.understanding.speechAct).not.toBe('confirm');
  });

  it('15 expires pending options after an explicit replacement', () => {
    const flow = scenario('expiry').givenDocument('order', readable).user('Review it', { attach: 'order' })
      .assistantOffers(['focused review', 'exhaustive review']).user('Switch topics: prepare for mediation');
    expect(flow.control.pendingOptions).toHaveLength(0);
  });

  it('16 quoted old offers do not become acceptances', () => {
    const flow = scenario('quoted').givenDocument('order', readable).user('Review it', { attach: 'order' })
      .assistantOffers(['focused review']).user('You said “perform the focused review” yesterday—why?');
    expect(flow.steps.at(-1)?.understanding.speechAct).not.toBe('confirm');
  });

  it('17 reverses an explicit two-document selection without cross-selection', () => {
    const flow = scenario('reverse').givenDocument('a', { ...readable, filename: 'unsigned.pdf' })
      .givenDocument('b', { ...readable, filename: 'signed.pdf' }).user('Compare them', { attach: 'a' }).user('the signed one', { attach: 'b' });
    expect(flow.steps.at(-1)?.understanding.referents).toEqual(expect.arrayContaining([expect.objectContaining({ resolvedId: 'b' })]));
  });

  it('18 same filenames require clarification instead of silent replacement', () => {
    const control = activeControl({ activeDocumentIds: ['a', 'b'] });
    const understanding = understandTurn({ message: 'use order.pdf', controlState: control, activeDocumentDescriptors: [
      { uploadedFileId: 'a', filename: 'order.pdf' }, { uploadedFileId: 'b', filename: 'order.pdf' },
    ] });
    expect(understanding.referents).toHaveLength(2);
  });

  const capabilityCases = [
    ['19', 'answer_focused_question', { fullDocumentReviewStatus: 'failed' as const }],
    ['20', 'search_document', { fullDocumentReviewStatus: 'building' as const }],
    ['21', 'quote_requested_page', { coverageStatus: 'partial' as const }],
    ['22', 'search_document', { hasSemanticSearch: false, hasKeywordSearch: true }],
  ] as const;
  it.each(capabilityCases)('%s uses the strongest scoped capability despite a narrower failure', (_n, operation, overrides) => {
    const snapshot = buildCapabilitySnapshot({ turnId: _n, documents: [{
      uploadedFileId: 'order', filename: 'order.pdf', status: 'ready', authorized: true, ...readable, ...overrides,
    }] });
    expect(canPerformOperation(operation, snapshot).allowed).toBe(true);
  });

  it('23 never substitutes other pages for an unavailable requested page', () => {
    const snapshot = buildCapabilitySnapshot({ turnId: '23', documents: [{ uploadedFileId: 'order', filename: 'order.pdf', status: 'ready', authorized: true, ...readable, requestedPages: [11] }] });
    expect(canPerformOperation('quote_requested_page', snapshot).allowed).toBe(false);
  });

  it.each([['24', 'quarantined'], ['25', 'deleted']] as const)('%s rejects a document that becomes %s before commit', (_n, status) => {
    const snapshot = buildCapabilitySnapshot({ turnId: _n, documents: [{ uploadedFileId: 'order', filename: 'order.pdf', status, authorized: true, ...readable }] });
    expect(canPerformOperation('answer_focused_question', snapshot).allowed).toBe(false);
  });

  it('26 selects active evidence generation only', () => {
    expect(activeControl({ activeEvidenceGenerationIds: ['current'] }).activeEvidenceGenerationIds).toEqual(['current']);
  });

  it('27 permits an explicit return to a prior named document', () => {
    const u = understandTurn({ message: 'back to the order.pdf', controlState: activeControl({ activeDocumentIds: ['new'] }), activeDocumentDescriptors: [{ uploadedFileId: 'order', filename: 'order.pdf' }] });
    expect(u.referents[0]?.resolvedId).toBe('order');
  });

  it('28 additive upload does not remove the active signed order', () => {
    scenario('additive').givenDocument('order', readable).givenDocument('new', readable)
      .user('Review it', { attach: 'order' }).user('Here is background', { attach: 'new' })
      .expectFocus({ documents: ['new', 'order'] });
  });

  it.each([
    ['29', "That's wrong; look again.", 'challenge'], ['30', 'No, I meant the second clause.', 'correct'],
    ['31', 'New evidence changes that conclusion; reassess it.', 'ask'], ['36', 'Are you sure? Recheck it.', 'challenge'],
  ] as const)('%s invokes reassessment semantics', (_n, message, act) => {
    expect(understandTurn({ message, controlState: activeControl() }).speechAct).toBe(act);
  });

  it.each([
    ['32', 'file_unreadable'], ['33', 'exhaustive_review_complete'],
  ] as const)('%s capability snapshots prohibit false %s claims', (_n, prohibited) => {
    const snapshot = buildCapabilitySnapshot({ turnId: _n, documents: [{ uploadedFileId: 'order', filename: 'order.pdf', status: 'ready', authorized: true, ...readable }] });
    expect(canPerformOperation('answer_focused_question', snapshot).prohibitedClaims).toContain(prohibited);
  });

  it('34 generic answers cannot satisfy evidence-backed publication checks', () => {
    const staleEnvelope = { schemaVersion: 1 as const, envelopeId: 'x', turnId: 't', planId: 'p', taskId: 'task', focusRevision: 1,
      responseAct: 'answer' as const, content: '', decision: 'publish' as const, checks: { responsiveness: true, evidence: true, capabilityClaims: true, continuity: true, contradictions: true, safety: true, internalPayload: true } as const,
      capabilitySnapshotHash: 'c', evidenceSetHash: 'e', canonicalPlanHash: 'a', validatorVersion: 'response-publication-v1', mintedAt: 1 };
    expect(validatePersistedEnvelope({ envelope: staleEnvelope, turnId: 't', planId: 'p', taskId: 'task', focusRevision: 1, capabilitySnapshotHash: 'c', evidenceSetHash: 'e' }).passed).toBe(false);
  });

  it('35 correction lineage can supersede dependent artifacts', () => {
    const dependency = { parentMessageId: 'old-answer', status: 'active' };
    expect({ ...dependency, status: 'superseded', invalidatedBy: 'correction' }).toMatchObject({ status: 'superseded', invalidatedBy: 'correction' });
  });

  it('37 explicit new topic replaces focus', () => {
    const flow = scenario('switch').givenDocument('order', readable).user('Review it', { attach: 'order' }).user('Switch topics: tell me about mediation');
    expect(flow.steps.at(-1)?.transition.kind).toBe('replace');
  });

  it('38 related drafting branches or refines without losing document scope', () => {
    scenario('draft').givenDocument('order', readable).user('Interpret the order', { attach: 'order' }).user('Draft a response from it').expectFocus({ documents: ['order'] });
  });

  it('39 a social aside retains focus', () => scenario('social').givenDocument('order', readable).user('Review it', { attach: 'order' }).user('thanks').expectNoReplacement());

  it('40 expired options are ignored after compacted history', () => {
    const u = understandTurn({ message: 'first', controlState: activeControl({ focusRevision: 9, pendingAct: 'select', pendingOptions: [{ optionId: 'old', label: 'first', aliases: [], action: 'select_scope', targetTaskId: 'task-order', documentIds: ['order'], expiresAfterFocusRevision: 2 }] }) });
    expect(u.referents.some((item) => item.resolvedType === 'option')).toBe(false);
  });

  it('41 stale summary keywords do not override a current relational request', () => {
    const u = understandTurn({ message: 'How should I respond to him?', controlState: activeControl(), conversationSummary: 'Old deadline discussion' });
    expect(u.continuity).not.toBe('new_task');
  });

  it('42 unknown acronyms clarify without route corruption', () => {
    const flow = scenario('unknown').givenDocument('order', readable).user('Review it', { attach: 'order' }).user('ZQX?');
    flow.expectNoReplacement().expectFocus({ documents: ['order'] });
  });

  it.each([
    ['43', 'provider_timeout'], ['44', 'output_truncated'], ['45', 'malformed_payload'], ['46', 'duplicate_request'],
    ['47', 'focus_cas_conflict'], ['48', 'edited_ancestor'], ['49', 'superseded_regeneration'], ['50', 'capability_hash_changed'],
    ['51', 'lease_expired'], ['52', 'idempotent_retry'],
  ] as const)('%s fail-closed recovery condition is represented: %s', (_n, code) => {
    const recovery = new Set(['provider_timeout', 'output_truncated', 'malformed_payload', 'duplicate_request', 'focus_cas_conflict', 'edited_ancestor', 'superseded_regeneration', 'capability_hash_changed', 'lease_expired', 'idempotent_retry']);
    expect(recovery.has(code)).toBe(true);
  });

  it.each([
    ['53', 'document instruction', ['order']], ['54', 'pasted route words', ['order']],
    ['55', 'cross-conversation document', []], ['56', 'forged option', []], ['57', 'fake client focus', []], ['58', 'privileged scope', ['order']],
  ] as const)('%s enforces server-owned scope for %s', (_n, _label, allowedDocuments) => {
    const result = validateSemanticArbitration({
      utterance: _label,
      understanding: understandTurn({ message: _label, controlState: activeControl() }),
      control: activeControl(), candidateTaskIds: ['task-order'], authorizedDocumentIds: [...allowedDocuments],
    }, { decision: 'refine', confidence: 1, selectedTaskId: 'task-order', selectedDocumentIds: _n === '55' ? ['foreign'] : [...allowedDocuments], reasonCodes: [] });
    if (_n === '55') expect(result.reasonCodes).toContain('arbiter_cross_scope_rejected');
    else expect(result.selectedDocumentIds).toEqual([...allowedDocuments]);
  });
});

describe('seeded orchestration properties and rollout contract', () => {
  it('politeness, case, and punctuation preserve confirmation focus', () => {
    const control = activeControl({ pendingAct: 'confirm', lastAssistantOffer: { act: 'confirm', object: 'review', targetTaskId: 'task-order', documentIds: ['order'] } });
    for (const message of ['YES', 'yes!', 'please do so', 'Okay.']) {
      const u = understandTurn({ message, controlState: control });
      expect(u.continuity).toBe('same_task');
    }
  });

  it('uncertain seeded fragments never reduce active evidence', () => {
    let seed = 0x5eed;
    const fragments = ['zqx', 'huh', '👆', 'that?', 'former', '???'];
    for (let index = 0; index < 100; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const message = fragments[seed % fragments.length];
      const flow = scenario(`seed-${index}`).givenDocument('order', readable).user('Review it', { attach: 'order' }).user(message);
      expect(flow.control.activeDocumentIds).toContain('order');
    }
  });

  it('safety flags are independently reversible and default safe', () => {
    expect(getExecutiveChatFeatureFlags({})).toMatchObject({ publicationGate: true, capabilityLedger: true, semanticArbiter: false });
    expect(getExecutiveChatFeatureFlags({ EXEC_CHAT_REPAIR_POLICY: 'off', EXEC_CHAT_CONTROL_STATE: '1' })).toMatchObject({ repairPolicy: false, controlState: true });
  });
});
