import { describe, expect, it } from 'vitest';
import { classifyLegalIntent } from '../legalIntent';
import { classifyMessage, preserveOrUpgradeDocumentRoute } from '../router';

describe('classifyMessage document follow-ups', () => {
  it.each([
    'What deadlines are in it?',
    'What does the order say about custody?',
    'Please double-check the uploaded PDF.',
    'Does it say shall or may?',
    'Compare this amended order to the prior order.',
  ])('routes stored-document references to a document-aware mode: %s', (message) => {
    const result = classifyMessage(message);
    expect(['document_analysis', 'order_interpretation']).toContain(result.mode);
    expect(result.requiresDocumentRetrieval).toBe(true);
  });

  it.each([
    'What does Texas law say about custody?',
    'How do I file a motion?',
  ])('does not route generic legal questions to document analysis: %s', (message) => {
    expect(classifyMessage(message).mode).not.toBe('document_analysis');
  });

  it('routes holiday-status questions to legal answer mode with web verification available', () => {
    const result = classifyMessage('Is Father\'s Day a federal holiday?');

    expect(result.mode).toBe('direct_legal_answer');
    expect(result.toolPlan.useWebSearch).toBe(true);
  });

  it('routes holiday possession timing questions to possession schedule interpretation', () => {
    const result = classifyMessage("Does Father's Day possession start Thursday or Friday under the order?");

    expect(result.mode).toBe('possession_access_schedule');
    expect(result.legalIntent).toBe('possession_access_schedule');
    expect(result.requiresDocumentRetrieval).toBe(true);
    expect(result.toolPlan.useFileSearch).toBe(true);
  });

  it('routes direct order meaning questions to order interpretation', () => {
    const result = classifyMessage('Under my order, does Monica have school enrollment authority?');

    expect(result.mode).toBe('order_interpretation');
    expect(result.legalIntent).toBe('direct_order_interpretation');
    expect(result.requiresDocumentRetrieval).toBe(true);
  });

  it('routes AppClose reply drafting to party message draft mode', () => {
    const result = classifyMessage('Draft an AppClose response to the other parent about pickup tonight.');

    expect(result.mode).toBe('party_message_draft');
    expect(result.legalIntent).toBe('draft_response_to_other_party');
    expect(result.requiresDocumentRetrieval).toBeUndefined();
    expect(result.toolPlan.useFileSearch).toBe(false);
  });

  it('uses document retrieval for party message drafts when the order is referenced', () => {
    const result = classifyMessage('Draft an AppClose response to the other parent based on my order.');

    expect(result.mode).toBe('party_message_draft');
    expect(result.documentReference?.referencesDocument).toBe(true);
    expect(result.requiresDocumentRetrieval).toBe(true);
    expect(result.toolPlan.useFileSearch).toBe(true);
  });

  it('keeps filing drafts in court-ready drafting mode', () => {
    const result = classifyMessage('Draft a court-ready motion to enforce the possession order.');

    expect(result.mode).toBe('court_ready_drafting');
    expect(result.legalIntent).toBe('court_filing_draft');
  });

  it('upgrades attached possession questions instead of forcing generic document analysis', () => {
    const classified = classifyMessage("Does Father's Day start Thursday or Friday?");
    const upgraded = preserveOrUpgradeDocumentRoute(classified, "Does Father's Day start Thursday or Friday?");

    expect(upgraded.mode).toBe('possession_access_schedule');
    expect(upgraded.legalIntent).toBe('possession_access_schedule');
    expect(upgraded.requiresDocumentRetrieval).toBe(true);
  });

  it('keeps generic uploaded-file prompts as document analysis', () => {
    const classified = classifyMessage('Please analyze the uploaded PDF.');
    const upgraded = preserveOrUpgradeDocumentRoute(classified, 'Please analyze the uploaded PDF.');

    expect(upgraded.mode).toBe('document_analysis');
    expect(upgraded.requiresDocumentRetrieval).toBe(true);
  });

  it('classifies legal intent without treating federal-holiday status as possession interpretation', () => {
    expect(classifyLegalIntent('Is Father\'s Day a federal holiday?')).not.toBe('possession_access_schedule');
    expect(classifyLegalIntent("Does Father's Day possession start Thursday or Friday?")).toBe('possession_access_schedule');
  });

  it('does not treat generic modal questions as direct order interpretation', () => {
    expect(classifyLegalIntent('Can I talk to the school tomorrow?')).not.toBe('direct_order_interpretation');
  });

  it('keeps procedure and evidence intents ahead of broad rights and timing words', () => {
    expect(classifyLegalIntent('What court forms do I need before filing?')).toBe('procedure_question');
    expect(classifyLegalIntent('What evidence should I show the court for unpaid support?')).toBe('evidence_strategy');
  });

  it('detects my-order exact wording questions consistently', () => {
    const result = classifyMessage('Does my order say I must give notice through AppClose?');

    expect(result.mode).toBe('order_interpretation');
    expect(result.documentReference?.referencesDocument).toBe(true);
    expect(result.documentReference?.requiresExactText).toBe(true);
  });
});
