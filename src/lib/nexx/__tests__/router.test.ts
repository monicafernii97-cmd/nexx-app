import { describe, expect, it } from 'vitest';
import { classifyLegalIntent } from '../legalIntent';
import { classifyFollowUpIntent, classifyMessage, preserveOrUpgradeDocumentRoute } from '../router';

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

  it('routes AppClose reply drafting to co-parent response strategy mode', () => {
    const result = classifyMessage('Draft an AppClose response to the other parent about pickup tonight.');

    expect(result.mode).toBe('co_parent_response');
    expect(result.legalIntent).toBe('co_parent_response_strategy');
    expect(result.requiresDocumentRetrieval).toBeUndefined();
    expect(result.toolPlan.useFileSearch).toBe(true);
  });

  it('uses document retrieval for co-parent response drafts when the order is referenced', () => {
    const result = classifyMessage('Draft an AppClose response to the other parent based on my order.');

    expect(result.mode).toBe('co_parent_response');
    expect(result.documentReference?.referencesDocument).toBe(true);
    expect(result.requiresDocumentRetrieval).toBe(true);
    expect(result.toolPlan.useFileSearch).toBe(true);
  });

  it('keeps filing drafts in court-ready drafting mode', () => {
    const result = classifyMessage('Draft a court-ready motion to enforce the possession order.');

    expect(result.mode).toBe('court_ready_drafting');
    expect(result.legalIntent).toBe('court_filing_draft');
  });

  it.each([
    'What do I file in response to his motion?',
    'How do I answer the petition?',
    'What response do I need to file?',
    'What do I file next after being served?',
  ])('routes court response planning prompts to court_response_planning: %s', (message) => {
    const result = classifyMessage(message);

    expect(result.mode).toBe('court_response_planning');
    expect(result.legalIntent).toBe('court_response_planning');
  });

  it('keeps explicit court response drafting in court-ready drafting mode', () => {
    const result = classifyMessage('Can you draft my response to the motion?');

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

  it('upgrades vague active-document follow-ups into legal interpretation', () => {
    const result = classifyMessage('Can he do that?', undefined, 'possession_access_schedule', true);

    expect(classifyFollowUpIntent('Can he do that?')).toBe('same_issue_yes_no');
    expect(result.mode).toBe('possession_access_schedule');
    expect(result.legalIntent).toBe('direct_order_interpretation');
    expect(result.documentReference?.referenceType).toBe('active_document_followup');
    expect(result.requiresDocumentRetrieval).toBe(true);
  });

  it('routes what-to-say active-document follow-ups to co-parent response with active order context', () => {
    const result = classifyMessage('What do I say back?', undefined, 'order_interpretation', true);

    expect(classifyFollowUpIntent('What do I say back?')).toBe('same_issue_what_to_say');
    expect(result.mode).toBe('co_parent_response');
    expect(result.legalIntent).toBe('co_parent_response_strategy');
    expect(result.documentReference?.referenceType).toBe('active_document_followup');
    expect(result.requiresDocumentRetrieval).toBe(true);
  });

  it('does not invent active context for vague questions without a document or prior issue', () => {
    const result = classifyMessage('Can he do that?');

    expect(result.mode).toBe('adaptive_chat');
    expect(result.documentReference?.referencesDocument).not.toBe(true);
    expect(result.requiresDocumentRetrieval).toBeUndefined();
  });

  it('routes emotional shorthand active-document follow-ups to order interpretation', () => {
    const result = classifyMessage(
      'I am so confused. Am I wrong?',
      "Prior issue: Father's Day possession dispute under a court order.",
      'possession_access_schedule',
      true
    );

    expect(classifyFollowUpIntent('Am I wrong?')).toBe('same_issue_rights_check');
    expect(result.mode).toBe('possession_access_schedule');
    expect(result.documentReference?.referenceType).toBe('active_document_followup');
    expect(result.requiresDocumentRetrieval).toBe(true);
  });

  it('routes basic pickup-time rights questions to a direct legal answer when no order context is active', () => {
    const result = classifyMessage('Can he just change the pickup time?');

    expect(result.mode).toBe('direct_legal_answer');
    expect(result.requiresDocumentRetrieval).toBeUndefined();
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
