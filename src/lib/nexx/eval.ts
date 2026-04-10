/**
 * Eval — quality evaluation framework for NEXX responses.
 * 
 * Provides scoring functions for automated testing and regression detection.
 */

import type { NexxAssistantResponse } from '../types';

interface EvalScore {
  dimension: string;
  score: number;  // 0-1
  notes: string;
}

/**
 * Evaluate a response against quality dimensions.
 * Used for automated testing and regression detection.
 */
export function evaluateResponse(
  response: NexxAssistantResponse,
  expectedMode: string
): EvalScore[] {
  const scores: EvalScore[] = [];

  // 1. Message quality — is the message non-empty and substantive?
  const messageLength = response.message.length;
  scores.push({
    dimension: 'message_substance',
    score: messageLength > 100 ? 1 : messageLength > 50 ? 0.5 : 0,
    notes: `Message length: ${messageLength} chars`,
  });

  // 2. Filler detection — does the message start with generic filler?
  const fillerPatterns = [
    /^Great question/i,
    /^I'd be happy to/i,
    /^Absolutely/i,
    /^That's a great/i,
  ];
  const hasFiller = fillerPatterns.some((p) => p.test(response.message));
  scores.push({
    dimension: 'no_filler',
    score: hasFiller ? 0 : 1,
    notes: hasFiller ? 'Response starts with filler' : 'Clean opening',
  });

  // 3. Confidence present — is confidence assessment populated?
  scores.push({
    dimension: 'confidence_present',
    score: response.artifacts.confidence ? 1 : 0,
    notes: response.artifacts.confidence
      ? `Confidence: ${response.artifacts.confidence.confidence}`
      : 'No confidence assessment',
  });

  // 4. Next steps — does the message include actionable next steps?
  const hasNextSteps = /next\s+steps?|action\s+items?|to\s+do|you\s+should/i.test(response.message);
  scores.push({
    dimension: 'next_steps',
    score: hasNextSteps ? 1 : 0.5,
    notes: hasNextSteps ? 'Has next steps' : 'No explicit next steps',
  });

  // 5. No fabricated citations
  const hasFakeCitations = /\d+\s+U\.S\.C\.\s+§\s+\d+|v\.\s+\w+,\s+\d+\s+\w+\.\s+\d+/i.test(response.message);
  scores.push({
    dimension: 'no_fake_citations',
    score: hasFakeCitations ? 0 : 1,
    notes: hasFakeCitations ? 'WARNING: Possible fabricated citation detected' : 'No suspicious citations',
  });

  return scores;
}

/**
 * Calculate an overall quality score from individual eval dimensions.
 */
export function overallScore(scores: EvalScore[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
}
