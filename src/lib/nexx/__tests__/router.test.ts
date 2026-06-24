import { describe, expect, it } from 'vitest';
import { classifyMessage } from '../router';

describe('classifyMessage document follow-ups', () => {
  it.each([
    'What deadlines are in it?',
    'What does the order say about custody?',
    'Please double-check the uploaded PDF.',
    'Does it say shall or may?',
    'Compare this amended order to the prior order.',
  ])('routes stored-document references to document analysis: %s', (message) => {
    expect(classifyMessage(message).mode).toBe('document_analysis');
  });

  it.each([
    'What does Texas law say about custody?',
    'How do I file a motion?',
  ])('does not route generic legal questions to document analysis: %s', (message) => {
    expect(classifyMessage(message).mode).not.toBe('document_analysis');
  });
});
