/**
 * Stream Renderer — client-side utilities for streaming responses.
 *
 * NOTE: The primary streaming pathway now uses SSE framing in the chat
 * page (event: delta / event: final) — see chat/[id]/page.tsx.
 * 
 * This module provides reusable helpers for advanced scenarios:
 * - createStreamAccumulator / pushChunk: marker-based hybrid streaming
 * - parseApiResponse: non-streaming fallback
 * - hasArtifacts / getArtifactSummary: structured response inspection
 */

import type { NexxAssistantResponse, NexxArtifacts } from '../types';

// ---------------------------------------------------------------------------
// Markers — must match the chat API route
// ---------------------------------------------------------------------------

export const FINAL_REWRITE_START = '[[NEXX_FINAL_REWRITE_START]]';
export const FINAL_REWRITE_END = '[[NEXX_FINAL_REWRITE_END]]';

// ---------------------------------------------------------------------------
// Stream State
// ---------------------------------------------------------------------------

export interface StreamState {
  /** Live draft text being accumulated from stream chunks. */
  liveText: string;
  /** Final polished text (set after rewrite marker is received). */
  finalText: string | null;
  /** Parsed artifacts from the final rewrite. */
  artifacts: NexxArtifacts | null;
  /** Whether the final rewrite has been received and parsed. */
  isFinal: boolean;
  /** Raw rewrite buffer (internal — used during marker accumulation). */
  _rewriteBuffer: string;
  /** Whether we're inside the rewrite markers. */
  _inRewrite: boolean;
}

// ---------------------------------------------------------------------------
// Accumulator
// ---------------------------------------------------------------------------

/**
 * Create a new stream accumulator for managing a streaming response.
 * Call `pushChunk()` for each SSE/stream chunk, then read state.
 */
export function createStreamAccumulator(): StreamState {
  return {
    liveText: '',
    finalText: null,
    artifacts: null,
    isFinal: false,
    _rewriteBuffer: '',
    _inRewrite: false,
  };
}

/**
 * Push a new chunk into the accumulator.
 * Detects [[NEXX_FINAL_REWRITE_START]] / [[NEXX_FINAL_REWRITE_END]] markers
 * and transitions from draft to final state.
 * 
 * Returns a NEW state object (immutable pattern for React).
 */
export function pushChunk(state: StreamState, chunk: string): StreamState {
  const next = { ...state };

  // If we've already finalized, ignore further chunks
  if (next.isFinal) return next;

  // Append chunk to the appropriate buffer
  if (next._inRewrite) {
    next._rewriteBuffer += chunk;

    // Check if we've received the end marker
    const endIdx = next._rewriteBuffer.indexOf(FINAL_REWRITE_END);
    if (endIdx !== -1) {
      const rewriteJson = next._rewriteBuffer.slice(0, endIdx).trim();
      try {
        const parsed = JSON.parse(rewriteJson) as NexxAssistantResponse;
        next.finalText = parsed.message;
        next.artifacts = parsed.artifacts;
        next.isFinal = true;
      } catch {
        // Parse failed — treat the raw rewrite as final text
        next.finalText = rewriteJson;
        next.isFinal = true;
      }
    }
  } else {
    // Accumulate draft text, checking for start marker
    const combined = next.liveText + chunk;
    const startIdx = combined.indexOf(FINAL_REWRITE_START);

    if (startIdx !== -1) {
      // Everything before the marker is draft text
      next.liveText = combined.slice(0, startIdx);
      // Everything after is the beginning of the rewrite
      next._rewriteBuffer = combined.slice(startIdx + FINAL_REWRITE_START.length);
      next._inRewrite = true;

      // Check if end marker is already in the buffer (small responses)
      const endIdx = next._rewriteBuffer.indexOf(FINAL_REWRITE_END);
      if (endIdx !== -1) {
        const rewriteJson = next._rewriteBuffer.slice(0, endIdx).trim();
        try {
          const parsed = JSON.parse(rewriteJson) as NexxAssistantResponse;
          next.finalText = parsed.message;
          next.artifacts = parsed.artifacts;
          next.isFinal = true;
        } catch {
          next.finalText = rewriteJson;
          next.isFinal = true;
        }
      }
    } else {
      next.liveText = combined;
    }
  }

  return next;
}

/**
 * Get the text that should be rendered in the UI.
 * Returns final polished text when available, live draft otherwise.
 */
export function getRenderableText(state: StreamState): string {
  return state.isFinal ? (state.finalText ?? state.liveText) : state.liveText;
}

// ---------------------------------------------------------------------------
// Phase 1 helpers (non-streaming)
// ---------------------------------------------------------------------------

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
