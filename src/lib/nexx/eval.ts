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

  // 1. Mode match — does the response match the expected route mode?
  // We check if the message content aligns with the expected mode characteristics
  const modeKeywordMap: Record<string, RegExp> = {
    safety_escalation: /\b(safety|crisis|emergency|danger)\b/i,
    court_ready_drafting: /\b(draft|motion|petition|court[-\s]?ready)\b/i,
    judge_lens_strategy: /\b(judge|credibility|neutrality|court.*perception)\b/i,
    local_procedure: /\b(procedure|filing|deadline|local.*rule)\b/i,
    document_analysis: /\b(document|order|analysis|interpret)\b/i,
    pattern_analysis: /\b(pattern|trend|repeated|history)\b/i,
    support_grounding: /\b(support|overwhelm|stress|anxious)\b/i,
    direct_legal_answer: /\b(law|statute|legal|rights?|custody)\b/i,
  };
  const modePattern = modeKeywordMap[expectedMode];
  if (modePattern) {
    const matches = modePattern.test(response.message);
    scores.push({
      dimension: 'mode_match',
      score: matches ? 1 : 0.5,
      notes: matches
        ? `Response content aligns with expected mode: ${expectedMode}`
        : `Response may not match expected mode: ${expectedMode}`,
    });
  } else {
    scores.push({
      dimension: 'mode_match',
      score: 0.5,
      notes: `No keyword validation for mode: ${expectedMode}`,
    });
  }

  // 2. Message quality — is the message non-empty and substantive?
  const messageLength = response.message.length;
  scores.push({
    dimension: 'message_substance',
    score: messageLength > 100 ? 1 : messageLength > 50 ? 0.5 : 0,
    notes: `Message length: ${messageLength} chars`,
  });

  // 3. Filler detection — does the message start with generic filler?
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

  // 4. Confidence present — is confidence assessment populated?
  scores.push({
    dimension: 'confidence_present',
    score: response.artifacts.confidence ? 1 : 0,
    notes: response.artifacts.confidence
      ? `Confidence: ${response.artifacts.confidence.confidence}`
      : 'No confidence assessment',
  });

  // 5. Next steps — does the message include actionable next steps?
  const hasNextSteps = /next\s+steps?|action\s+items?|to\s+do|you\s+should/i.test(response.message);
  scores.push({
    dimension: 'next_steps',
    score: hasNextSteps ? 1 : 0.5,
    notes: hasNextSteps ? 'Has next steps' : 'No explicit next steps',
  });

  // 6. No fabricated citations
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
