import { describe, expect, it } from 'vitest';
import { messageReferencesStoredDocument } from '../documentMemory';

describe('messageReferencesStoredDocument', () => {
  it.each([
    'What deadlines are in it?',
    'What does the order say about custody?',
    'Can you double-check the uploaded PDF?',
    'According to the court order, what should I do next?',
    'Please pull up the document again and verify the visitation terms.',
  ])('detects document follow-up: %s', (message) => {
    expect(messageReferencesStoredDocument(message)).toBe(true);
  });

  it.each([
    'How are you today?',
    'How do I file in county court?',
    'Can you help me calm down before mediation?',
    'What does custody law say in Texas?',
    'What is the filing deadline in my county?',
  ])('does not over-trigger on unrelated messages: %s', (message) => {
    expect(messageReferencesStoredDocument(message)).toBe(false);
  });
});
