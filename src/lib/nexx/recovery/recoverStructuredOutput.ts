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
      const retryResponse = await (openai.responses as any).create({
        model: retryConfig.model,
        input: [
          { role: 'system', content: retryConfig.systemPrompt },
          { role: 'developer', content: retryConfig.developerPrompt },
          {
            role: 'user',
            content: `The previous response was not valid JSON. Please answer this question again with properly structured JSON output:\n\n${retryConfig.userPayload.message}`,
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'nexx_assistant_response',
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                message: { type: 'string' },
                artifacts: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    draftReady: { type: ['object', 'null'] },
                    timelineReady: { type: ['object', 'null'] },
                    exhibitReady: { type: ['object', 'null'] },
                    judgeSimulation: { type: ['object', 'null'] },
                    oppositionSimulation: { type: ['object', 'null'] },
                    confidence: { type: ['object', 'null'] },
                  },
                  required: ['draftReady', 'timelineReady', 'exhibitReady',
                             'judgeSimulation', 'oppositionSimulation', 'confidence'],
                },
              },
              required: ['message', 'artifacts'],
            },
          },
        },
      });

      const retryText = retryResponse.output_text || retryResponse.output?.[0]?.content?.[0]?.text || '';
      const parsed = JSON.parse(retryText);
      if (validateAssistantResponse(parsed)) {
        return { data: parsed as NexxAssistantResponse, stage: 'retry' };
      }
    } catch {
      // Retry also failed — fall through to fallback
    }
  }

  // Stage 4 — Fallback: wrap raw text as message with null artifacts
  const fallbackMessage = rawText.length > 0
    ? rawText
    : 'I was unable to generate a structured response. Please try rephrasing your question.';

  return {
    data: {
      message: fallbackMessage,
      artifacts: EMPTY_ARTIFACTS,
    },
    stage: 'fallback',
  };
}
