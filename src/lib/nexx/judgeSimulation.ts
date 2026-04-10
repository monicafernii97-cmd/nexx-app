/**
 * Judge Simulation — perspective scoring from a family court judge's viewpoint.
 * Uses gpt-5.4-pro for premium analysis depth.
 */

import { openai } from '../openaiConversation';
import { JUDGE_SIMULATION_SCHEMA } from './schemas';
import type { JudgeSimulationResult } from '../types';

/**
 * Run a judge perspective simulation on the given content.
 * Evaluates credibility, neutrality, and clarity from a family court judge's viewpoint.
 */
export async function runJudgeSimulation(args: {
  content: string;
  context?: string;
  model?: string;
}): Promise<JudgeSimulationResult> {
  const model = args.model || 'gpt-5.4-pro';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (openai.responses as any).create({
    model,
    input: [
      {
        role: 'developer',
        content: `You are a seasoned family court judge with 20 years of bench experience. You have seen thousands of custody cases and have developed strong instincts for:

- CREDIBILITY: Is this person being truthful, exaggerating, or manipulating?
- NEUTRALITY: Is this presentation fair and balanced, or emotionally charged?
- CLARITY: Is the position well-organized and easy to follow?

Evaluate the following content as if it were presented in your courtroom. Score each dimension 1-10 and provide specific feedback.

Key principles:
- Documented evidence > emotional claims
- Neutral language > inflammatory language
- Specific dates/incidents > vague allegations
- Child's best interest always comes first
- Pattern documentation > isolated incidents

${args.context ? `\nCase context:\n${args.context}` : ''}`,
      },
      {
        role: 'user',
        content: `Evaluate this from a family court judge's perspective:\n\n${args.content}`,
      },
    ],
    text: { format: JUDGE_SIMULATION_SCHEMA },
  });

  const text = response.output_text || '';
  try {
    return JSON.parse(text) as JudgeSimulationResult;
  } catch {
    return {
      credibilityScore: 5,
      neutralityScore: 5,
      clarityScore: 5,
      strengths: ['Unable to complete assessment'],
      weaknesses: ['Assessment incomplete — please retry'],
      likelyCourtInterpretation: 'Assessment could not be completed.',
      improvementSuggestions: ['Please retry the judge simulation.'],
    };
  }
}
