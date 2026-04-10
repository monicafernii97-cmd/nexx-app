/**
 * Stream Renderer — client-side accumulator for streaming responses.
 * 
 * Phase 1: Non-streaming (structured output requires full response).
 * Phase 2: Will support streaming with [[NEXX_FINAL_REWRITE_START]] markers.
 */

import type { NexxAssistantResponse } from '../types';

/**
 * Parse a non-streaming response from the chat API.
 * Extracts the structured NexxAssistantResponse from the API response.
 */
export function parseApiResponse(apiResponse: {
  ok: boolean;
  response?: NexxAssistantResponse;
  openaiConversationId?: string;
  routeMode?: string;
  error?: string;
}): {
  success: boolean;
  response?: NexxAssistantResponse;
  openaiConversationId?: string;
  routeMode?: string;
  error?: string;
} {
  if (!apiResponse.ok || !apiResponse.response) {
    return {
      success: false,
      error: apiResponse.error || 'Unknown error',
    };
  }

  return {
    success: true,
    response: apiResponse.response,
    openaiConversationId: apiResponse.openaiConversationId,
    routeMode: apiResponse.routeMode,
  };
}

/**
 * Check if a response has any non-null artifacts.
 */
export function hasArtifacts(response: NexxAssistantResponse): boolean {
  const { artifacts } = response;
  return !!(
    artifacts.draftReady ||
    artifacts.timelineReady ||
    artifacts.exhibitReady ||
    artifacts.judgeSimulation ||
    artifacts.oppositionSimulation ||
    artifacts.confidence
  );
}

/**
 * Get a summary of which artifacts are present in a response.
 */
export function getArtifactSummary(response: NexxAssistantResponse): string[] {
  const { artifacts } = response;
  const present: string[] = [];

  if (artifacts.draftReady) present.push('Court-Ready Draft');
  if (artifacts.timelineReady) present.push('Timeline');
  if (artifacts.exhibitReady) present.push('Exhibit Index');
  if (artifacts.judgeSimulation) present.push('Judge Simulation');
  if (artifacts.oppositionSimulation) present.push('Opposition Analysis');
  if (artifacts.confidence) present.push(`Confidence: ${artifacts.confidence.confidence}`);

  return present;
}
