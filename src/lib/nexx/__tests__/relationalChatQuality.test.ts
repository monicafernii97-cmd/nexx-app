import { describe, expect, it } from 'vitest';
import { isDocumentAvailabilityQuestion, detectDocumentReference } from '../documentReferenceDetection';
import { buildDeveloperBehaviorPrompt } from '../prompts/developerPrompt';
import {
  classifyFollowUpIntent,
  classifyMessage,
  preserveOrUpgradeDocumentRoute,
  resolveTurnRoute,
} from '../router';

describe('relational chat quality routing', () => {
  it.each([
    'do you have my court order saved',
    'do you have my court order saved and',
    'Is my court order available in the case?',
    'Is my order still there?',
  ])('treats document availability as a direct conversational question: %s', (message) => {
    expect(isDocumentAvailabilityQuestion(message)).toBe(true);
    expect(detectDocumentReference(message).referencesDocument).toBe(false);
    const classified = classifyMessage(message, undefined, 'document_analysis', true);
    expect(classified.mode).toBe('adaptive_chat');
    expect(preserveOrUpgradeDocumentRoute(classified, message, 'document_analysis').mode)
      .toBe('adaptive_chat');
  });

  it.each([
    'Can you see what my order says about medical decisions?',
    'What does the court order mean for Thursday possession?',
    'Does my saved order say he gets the holiday?',
  ])('does not mistake a substantive order question for storage metadata: %s', (message) => {
    expect(isDocumentAvailabilityQuestion(message)).toBe(false);
    expect(detectDocumentReference(message).referencesDocument).toBe(true);
    expect(classifyMessage(message, undefined, 'document_analysis', true).mode).not.toBe('adaptive_chat');
  });

  it.each([
    'Can you review and analyze this thread of conversation between us and give me feedback?',
    'Reading this not as a judge, what do you see from both sides transparently?',
    'Please assess these AppClose messages and the communication pattern.',
  ])('routes whole-conversation review to nuanced pattern analysis: %s', (message) => {
    expect(classifyMessage(message).mode).toBe('pattern_analysis');
  });

  it('keeps a single-message reply request in drafting mode', () => {
    expect(classifyMessage('Review this message and draft a reply: Please send the appointment time.').mode)
      .toBe('party_message_draft');
  });

  it('keeps a long AppClose review in pattern analysis despite quoted court, service, and hurt language', () => {
    const message = `
      Can you review and analyze this full AppClose conversation and give me transparent feedback from both sides?

      Giovanni: The court order supersedes our agreement. If the call is not answered, I will document a violation.
      Monica: Does submitting this whole exchange help or hurt my case?
      Giovanni: I was served with the prior order and have spoken with my lawyer.
      Monica: Years ago, during our relationship, he physically hurt me. I am sharing that as historical context,
      not because I am in danger now. What do you see in the communication dynamic?
    `;

    const classified = classifyMessage(message, undefined, 'document_analysis', true);
    expect(classified.mode).toBe('pattern_analysis');
    expect(preserveOrUpgradeDocumentRoute(classified, message, 'document_analysis').mode)
      .toBe('pattern_analysis');
  });

  it('does not interpret ordinary case-impact language as a safety emergency', () => {
    expect(classifyMessage('Would including these messages help or hurt my case?').mode)
      .not.toBe('safety_escalation');
  });

  it('treats clearly historical abuse context as relational analysis, not a present emergency', () => {
    const message = 'He physically hurt me years ago during our relationship. With that context, what do you see in this behavior and the words toward me?';
    expect(classifyMessage(message).mode).toBe('pattern_analysis');
  });

  it('still escalates an explicit current violent threat', () => {
    expect(classifyMessage('He threatened to kill me tonight and I am in danger right now.').mode)
      .toBe('safety_escalation');
  });

  it.each([
    'He is going to kill me tonight.',
    'He told me that he will kill me.',
    'He texted me that he will hurt me when I leave.',
  ])('escalates a direct current threat without requiring magic reporting words: %s', (message) => {
    expect(classifyMessage(message).mode).toBe('safety_escalation');
  });

  it('does not let historical context suppress a separate current safety report', () => {
    const message = 'He abused me when we were together. He is stalking me and I need help.';
    expect(classifyMessage(message).mode).toBe('safety_escalation');
  });

  it('does not let historical context suppress current danger in the same sentence', () => {
    const message = 'He abused me when we were together, and he is stalking me and I need help.';
    expect(classifyMessage(message).mode).toBe('safety_escalation');
  });

  it('does not let historical harm suppress a present-tense death threat in the same sentence', () => {
    const message = 'He hit me years ago and says he will kill me.';
    expect(classifyMessage(message).mode).toBe('safety_escalation');
  });

  it('does not turn a request to understand historical stalking into a current emergency', () => {
    const message = 'He was stalking me when we were together and I need help understanding the pattern.';
    expect(classifyMessage(message).mode).not.toBe('safety_escalation');
  });

  it('does not attach present reflection words to explicitly historical stalking', () => {
    const message = 'He was stalking me when we were together, and now I want to understand why this pattern still affects me.';
    expect(classifyMessage(message).mode).not.toBe('safety_escalation');
  });

  it('does not treat present reporting of a historical threat as a new threat', () => {
    const message = 'He says he wanted to kill me years ago, and I need help understanding that history.';
    expect(classifyMessage(message).mode).not.toBe('safety_escalation');
  });

  it('does not let an attached document turn a new relational topic into order interpretation', () => {
    const message = 'Can you explain how to emotionally detach without becoming cold?';
    const classified = classifyMessage(message, undefined, 'document_analysis', true);

    expect(classified.mode).toBe('supportive_strategy');
    expect(preserveOrUpgradeDocumentRoute(classified, message, 'document_analysis').mode)
      .toBe('supportive_strategy');
  });

  it('uses the shared resolver to keep an old active order out of a pasted-thread review', () => {
    const result = resolveTurnRoute({
      message: 'Please review this AppClose conversation. He repeatedly says the court order controls. What do you see from both sides?',
      activeMode: 'document_analysis',
      hasActiveDocumentContext: true,
    });

    expect(result.mode).toBe('pattern_analysis');
  });

  it.each([
    ['Can you explain more?', 'pattern_analysis'],
    ['Yes.', 'supportive_strategy'],
    ['Can we make this more natural?', 'co_parent_response'],
    ['This happened Sunday and I got her back Monday. Can we rephrase the message?', 'co_parent_response'],
    ['I do not want to include "keep me informed."', 'co_parent_response'],
    ['I think he already knows that, so I don\'t need to remind him.', 'co_parent_response'],
  ] as const)('continues short relational follow-ups in the active non-document route: %s', (message, mode) => {
    expect(classifyFollowUpIntent(message)).not.toBe('new_issue');
    expect(classifyMessage(message, undefined, mode, true).mode).toBe(mode);
  });

  it('keeps the relational analysis contract in every route prompt', () => {
    const prompt = buildDeveloperBehaviorPrompt('pattern_analysis');
    expect(prompt).toContain('If the user asks for a human read "not as a judge," honor that request');
    expect(prompt).toContain('balanced but not artificially symmetrical');
    expect(prompt).toContain('what is directly observable');
    expect(prompt).toContain('what the user reports as history');
    expect(prompt).toContain('whether a response is actually needed');
    expect(prompt).toContain('Do not declare the other person\'s hidden motive');
    expect(prompt).toContain('Preserve iterative constraints');
    expect(prompt).toContain('shared portal credentials');
    expect(prompt).toContain('Avoid automatic praise');
  });
});
