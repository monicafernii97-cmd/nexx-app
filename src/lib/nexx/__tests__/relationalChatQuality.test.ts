import { describe, expect, it } from 'vitest';
import { isDocumentAvailabilityQuestion, detectDocumentReference } from '../documentReferenceDetection';
import { buildDeveloperBehaviorPrompt } from '../prompts/developerPrompt';
import { classifyMessage } from '../router';

describe('relational chat quality routing', () => {
  it.each([
    'do you have my court order saved',
    'Is my court order available in the case?',
    'Is my order still there?',
  ])('treats document availability as a direct conversational question: %s', (message) => {
    expect(isDocumentAvailabilityQuestion(message)).toBe(true);
    expect(detectDocumentReference(message).referencesDocument).toBe(false);
    expect(classifyMessage(message, undefined, 'document_analysis', true).mode).toBe('adaptive_chat');
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

  it('keeps the relational analysis contract in every route prompt', () => {
    const prompt = buildDeveloperBehaviorPrompt('pattern_analysis');
    expect(prompt).toContain('balanced but not artificially symmetrical');
    expect(prompt).toContain('what is directly observable');
    expect(prompt).toContain('what the user reports as history');
    expect(prompt).toContain('whether a response is actually needed');
    expect(prompt).toContain('Do not declare the other person\'s hidden motive');
  });
});
