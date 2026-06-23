import { describe, expect, it } from 'vitest';
import { classifyMessage } from '../router';

describe('classifyMessage document follow-ups', () => {
  it.each([
    'What deadlines are in it?',
    'What does the order say about custody?',
    'Please double-check the uploaded PDF.',
  ])('routes stored-document references to document analysis: %s', (message) => {
    expect(classifyMessage(message).mode).toBe('document_analysis');
  });
});
