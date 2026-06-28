/**
 * Recovery pipeline for when structured output fails.
 * 
 * 4 stages:
 * 1. Initial Parse: JSON.parse + validate
 * 2. Extract JSON: Regex for JSON within markdown/prose
 * 3. Retry: Re-call responses.create with repair prompt
 * 4. Fallback: Return safe default
 */

import type { NexxAssistantResponse, RecoveryResult } from '../../types';
import { validateAssistantResponse } from './validators';
import { openai } from '../../openaiConversation';
import { NEXX_RESPONSE_SCHEMA } from '../schemas';

const EMPTY_ARTIFACTS = {
  draftReady: null,
  timelineReady: null,
  exhibitReady: null,
  judgeSimulation: null,
  oppositionSimulation: null,
  confidence: null,
};

interface RetryConfig {
  systemPrompt: string;
  developerPrompt: string;
  userPayload: { message: string };
  model: string;
  requestOptions?: {
    timeout?: number;
    maxRetries?: number;
  };
}

/**
 * Attempt to recover a valid NexxAssistantResponse from raw text.
 */
export async function recoverStructuredOutput(
  rawText: string,
  retryConfig?: RetryConfig
): Promise<RecoveryResult> {
  // Stage 1 — Direct parse
  try {
    const parsed = JSON.parse(rawText);
    if (validateAssistantResponse(parsed)) {
      return { data: parsed as NexxAssistantResponse, stage: 'initial_parse' };
    }
  } catch {
    // Not valid JSON — continue to next stage
  }

  // Stage 2 — Extract JSON from markdown fences or embedded in prose
  const jsonMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) ||
                    rawText.match(/(\{[\s\S]*"message"[\s\S]*"artifacts"[\s\S]*\})/);
  if (jsonMatch?.[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (validateAssistantResponse(parsed)) {
        return { data: parsed as NexxAssistantResponse, stage: 'extract_json' };
      }
    } catch {
      // Extracted text wasn't valid JSON either
    }
  }

  // Stage 3 — Retry with repair prompt (if config provided)
  if (retryConfig) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const retryResponse = await (openai.responses as any).create(
        {
          model: retryConfig.model,
          input: [
            { role: 'system', content: retryConfig.systemPrompt },
            { role: 'developer', content: retryConfig.developerPrompt },
            {
              role: 'user',
              content: `The previous response was not valid JSON. Please answer this question again with properly structured JSON output:\n\n${retryConfig.userPayload.message}`,
            },
          ],
          text: { format: NEXX_RESPONSE_SCHEMA },
        },
        retryConfig.requestOptions
      );

      const retryText = retryResponse.output_text || retryResponse.output?.[0]?.content?.[0]?.text || '';
      const parsed = JSON.parse(retryText);
      if (validateAssistantResponse(parsed)) {
        return { data: parsed as NexxAssistantResponse, stage: 'retry' };
      }
    } catch {
      // Retry also failed — fall through to fallback
    }
  }

  // Stage 4 — Fallback: safe generic message (never echo raw payload to client)
  if (rawText.length > 0) {
    console.warn('[Recovery] All stages failed. Raw text length:', rawText.length);
  }

  return {
    data: {
      message: 'I was unable to generate a structured response. Please try rephrasing your question.',
      artifacts: EMPTY_ARTIFACTS,
      documentAnswer: null,
    },
    stage: 'fallback',
  };
}
