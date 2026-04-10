'use client';

/**
 * useNexxStream — React hook for Phase 2 streaming hybrid.
 * 
 * Wraps the stream accumulator in React state, providing:
 * - `text`: the currently renderable text (draft or final)
 * - `artifacts`: parsed artifacts (null until final rewrite)
 * - `isFinal`: whether the response has been finalized
 * - `isStreaming`: whether chunks are actively being received
 * - `startStream(url, body)`: initiate a streaming request
 * - `reset()`: clear state for a new message
 */

import { useState, useCallback, useRef } from 'react';
import {
  createStreamAccumulator,
  pushChunk,
  getRenderableText,
  type StreamState,
} from '@/lib/nexx/streamRenderer';
import type { NexxArtifacts } from '@/lib/types';

interface UseNexxStreamReturn {
  /** Current text to display (draft while streaming, final after rewrite). */
  text: string;
  /** Parsed artifacts from the final response (null during streaming). */
  artifacts: NexxArtifacts | null;
  /** Whether the final rewrite has been received and parsed. */
  isFinal: boolean;
  /** Whether a stream is currently in progress. */
  isStreaming: boolean;
  /** Error from the most recent stream attempt (null if none). */
  error: Error | null;
  /** Start a streaming request to the given URL with the given body. */
  startStream: (url: string, body: Record<string, unknown>) => Promise<StreamState>;
  /** Reset the stream state for a new message. */
  reset: () => void;
}

export function useNexxStream(): UseNexxStreamReturn {
  const [state, setState] = useState<StreamState>(createStreamAccumulator);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    // Abort any in-flight stream
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setState(createStreamAccumulator());
    setIsStreaming(false);
    setError(null);
  }, []);

  const startStream = useCallback(async (url: string, body: Record<string, unknown>): Promise<StreamState> => {
    // Reset state
    const initial = createStreamAccumulator();
    setState(initial);
    setIsStreaming(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    let currentState = initial;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, stream: true }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Stream request failed: ${response.status} ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response did not include a readable stream');
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        currentState = pushChunk(currentState, chunk);
        setState(currentState);
      }

      // Flush decoder
      const finalChunk = decoder.decode();
      if (finalChunk) {
        currentState = pushChunk(currentState, finalChunk);
        setState(currentState);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Stream was intentionally aborted — not an error
      } else {
        const streamError = err instanceof Error ? err : new Error(String(err));
        setError(streamError);
        console.error('[useNexxStream] Stream error:', streamError);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }

    return currentState;
  }, []);

  return {
    text: getRenderableText(state),
    artifacts: state.artifacts,
    isFinal: state.isFinal,
    isStreaming,
    error,
    startStream,
    reset,
  };
}
