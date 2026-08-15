import { describe, expect, it } from 'vitest';
import { buildContextPrompt } from '../prompts/contextPrompt';

describe('dynamic context prompt continuity', () => {
  it('carries durable goals and dates forward with facts and open questions', () => {
    const prompt = buildContextPrompt({
      conversationSummary: {
        decisions: ['Do not invite routine daily updates'],
        keyFacts: ['The parents use AppClose'],
        dates: ['Urology appointment: February 10'],
        goals: ['Request a parallel-parenting structure'],
        unresolvedQuestions: ['Whether the current petition needs amendment'],
        turnCount: 24,
      },
    });

    expect(prompt).toContain('Conversation History (24 turns)');
    expect(prompt).toContain('Do not invite routine daily updates');
    expect(prompt).toContain('Important dates: Urology appointment: February 10');
    expect(prompt).toContain('User goals: Request a parallel-parenting structure');
    expect(prompt).toContain('Whether the current petition needs amendment');
  });

  it('uses saved emotional and behavioral context as calibration rather than proof', () => {
    const prompt = buildContextPrompt({
      styleProfile: { tonePreference: 'strategic' },
      supportProfile: { emotionalState: 'overwhelmed', hasTherapist: true },
      nexProfile: {
        communicationStyle: 'formal and repetitive',
        behaviors: ['frequent administrative criticism'],
        triggerPatterns: ['accusations about parenting'],
        aiInsights: 'The user experiences legalistic messages as pressure.',
        dangerLevel: 2,
      },
    });

    expect(prompt).toContain('Tone preference: strategic');
    expect(prompt).toContain('Current self-reported emotional state: overwhelmed');
    expect(prompt).toContain('User-reported behaviors: frequent administrative criticism');
    expect(prompt).toContain('User trigger patterns: accusations about parenting');
    expect(prompt).toContain('not independently proven facts or a clinical diagnosis');
  });
});
