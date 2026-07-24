import { describe, expect, it } from 'vitest';
import type { RouteMode } from '../../types';
import { responseLifecyclePolicy } from '../responseLifecycle';
import { resolveTurnRoute } from '../router';

function route(message: string, activeMode?: RouteMode, hasDocument = true) {
  return resolveTurnRoute({
    message,
    activeMode,
    hasActiveDocumentContext: hasDocument,
  }).mode;
}

describe('user-supplied relational chat benchmark', () => {
  it('keeps the long review and its short follow-ups in relational reasoning', () => {
    const review = `
      Can you do the same review and analysis of this full AppClose conversation and give me feedback?
      Giovanni says the court order supersedes our agreement and says he will document violations.
      The thread discusses service, a hearing, medical appointments, a page of the order, and past hurt.
      I want a transparent assessment from both sides, not a deadline calculation.
    `;
    const firstMode = route(review, 'document_analysis');
    expect(firstMode).toBe('pattern_analysis');
    expect(responseLifecyclePolicy(firstMode).preserveProviderProse).toBe(true);

    const continuationMode = route('Yes, let\'s do all 3.', firstMode);
    expect(continuationMode).toBe('pattern_analysis');

    const humanMode = route(
      'Can you explain, reading this not as a judge, what do you see from both sides transparently?',
      continuationMode,
    );
    expect(humanMode).toBe('pattern_analysis');
  });

  it('routes emotional-detachment and historical-abuse context without a false emergency', () => {
    expect(route(
      'Translate this into how to emotionally detach without becoming cold and protect my daughter emotionally.',
      'pattern_analysis',
    )).toBe('supportive_strategy');

    expect(route(
      'He physically hurt me years ago during our relationship. With that history, what do you see in his current words and behavior toward me?',
      'supportive_strategy',
    )).toBe('pattern_analysis');
  });

  it('keeps iterative co-parent drafting natural and remembers rejected wording', () => {
    let activeMode: RouteMode = 'co_parent_response';
    for (const message of [
      'Can we make this sound more natural?',
      'This happened Sunday and I got her back Monday. Can we rephrase the message?',
      'I do not want to include "continue to keep me informed" because I want to parallel parent.',
      'I think he already knows to share important information, so I don\'t need to remind him.',
    ]) {
      activeMode = route(message, activeMode);
      expect(responseLifecyclePolicy(activeMode).preserveProviderProse).toBe(true);
      expect(activeMode).not.toBe('document_analysis');
      expect(activeMode).not.toBe('order_interpretation');
    }
  });

  it('still sends genuinely procedural and order-specific questions to legal workflows', () => {
    expect(route(
      'What would I file in Texas if I wanted parallel parenting, and how would it be ordered if I am pro se?',
      'supportive_strategy',
      false,
    )).toBe('pro_se_guidance');

    expect(route(
      'According to my saved court order, what exact medical-record access does each parent have?',
      'supportive_strategy',
    )).toBe('order_interpretation');
  });
});
