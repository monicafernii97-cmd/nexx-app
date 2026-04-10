/**
 * Confidence Layer — post-generation response confidence assessment.
 * 
 * Uses gpt-5.4-mini for fast assessment.
 * Result is attached to response metadata and surfaced in MessageBubble.
 */

import { openai } from '../openaiConversation';
import { LEGAL_CONFIDENCE_SCHEMA } from './schemas';
import type { NexxAssistantResponse, LegalConfidence, LocalCourtSource } from '../types';
import type { CaseGraph } from './caseGraph';

/**
 * Assess the confidence of a response based on:
 * - Whether retrieval sources were used
 * - Whether the case graph has relevant data
 * - The specificity of the claims made
 */
export async function assessConfidence(
  response: NexxAssistantResponse,
  retrievedSources: LocalCourtSource[],
  caseGraph?: CaseGraph
): Promise<LegalConfidence> {
  const hasRetrieval = retrievedSources.length > 0;
  const hasJurisdiction = !!caseGraph?.jurisdiction?.state;
  const hasCaseData = !!caseGraph && Object.keys(caseGraph).some(
    (k) => {
      const val = caseGraph[k as keyof CaseGraph];
      return Array.isArray(val) ? val.length > 0 : !!val && typeof val === 'object' && Object.keys(val).length > 0;
    }
  );

  // Only skip model assessment if no sources and no case data at all
  if (!hasRetrieval && !hasCaseData && !hasJurisdiction) {
    return {
      confidence: 'low',
      basis: 'No retrieved sources, case data, or jurisdiction information available.',
      evidenceSufficiency: 'Insufficient',
      missingSupport: ['No retrieved sources', 'No case data', 'Jurisdiction unknown'],
    };
  }

  // For borderline cases, use mini model for assessment
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (openai.responses as any).create({
      model: 'gpt-5.4-mini',
      input: [
        {
          role: 'developer',
          content: `You are a legal confidence assessor. Evaluate this AI response for confidence level.

Factors to consider:
- Does the response cite specific sources, statutes, or verified procedures?
- Does the response make jurisdiction-specific claims without verification?
- Is the response general legal knowledge or specific to the user's case?
- Are there claims that could mislead if wrong?

Context:
- Retrieved sources available: ${hasRetrieval ? 'yes' : 'no'}
- Jurisdiction confirmed: ${hasJurisdiction ? caseGraph?.jurisdiction?.state : 'no'}
- Case data available: ${hasCaseData ? 'yes' : 'no'}`,
        },
        {
          role: 'user',
          content: `Assess confidence for this response:\n\n${response.message.slice(0, 1500)}`,
        },
      ],
      text: { format: LEGAL_CONFIDENCE_SCHEMA },
    });

    const text = result.output_text || '';
    return JSON.parse(text) as LegalConfidence;
  } catch {
    // Fallback: infer from available context
    if (hasRetrieval) {
      return {
        confidence: 'moderate',
        basis: 'Retrieved sources available but confidence assessment failed.',
        evidenceSufficiency: 'Partial',
        missingSupport: ['Confidence assessment unavailable'],
      };
    }

    return {
      confidence: 'moderate',
      basis: 'General knowledge response without jurisdiction-specific verification.',
      evidenceSufficiency: 'Limited',
      missingSupport: ['No retrieved sources', 'Jurisdiction not verified'],
    };
  }
}
