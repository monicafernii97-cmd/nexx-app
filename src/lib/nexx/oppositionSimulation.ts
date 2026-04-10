/**
 * Opposition Simulation — adversarial attack-point analysis.
 * Uses gpt-5.4-pro for premium analysis depth.
 */

import { openai } from '../openaiConversation';
import { OPPOSITION_SIMULATION_SCHEMA } from './schemas';
import type { OppositionSimulationResult } from '../types';

/**
 * Run an opposition perspective simulation.
 * Identifies how opposing counsel would attack the given content.
 */
export async function runOppositionSimulation(args: {
  content: string;
  context?: string;
  model?: string;
}): Promise<OppositionSimulationResult> {
  const model = args.model || 'gpt-5.4-pro';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (openai.responses as any).create({
    model,
    input: [
      {
        role: 'developer',
        content: `You are an experienced family law attorney representing the OPPOSING party. Your job is to find every weakness, inconsistency, and vulnerability in the other side's position.

Think like an adversary:
- What factual claims are unsupported or exaggerated?
- What framing could be twisted to look bad?
- What evidence is missing that would strengthen their case?
- What counterarguments would you raise?
- How would you cross-examine this testimony?

Be thorough but fair — identify real vulnerabilities, not bad-faith attacks.

${args.context ? `\nCase context:\n${args.context}` : ''}`,
      },
      {
        role: 'user',
        content: `Analyze this from the opposition's perspective:\n\n${args.content}`,
      },
    ],
    text: { format: OPPOSITION_SIMULATION_SCHEMA },
  });

  const text = response.output_text || '';
  try {
    return JSON.parse(text) as OppositionSimulationResult;
  } catch {
    return {
      likelyAttackPoints: ['Assessment could not be completed'],
      framingRisks: [],
      whatNeedsTightening: [],
      preemptionSuggestions: ['Please retry the opposition simulation.'],
    };
  }
}
