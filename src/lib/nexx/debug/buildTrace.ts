/**
 * Debug trace builder — creates and manages NexxTrace objects
 * for auditability across all AI calls.
 */

import type { NexxTrace } from '../../types';
import { randomUUID } from 'crypto';

/**
 * Create an empty trace with the request info filled in.
 * Fields are populated as the request progresses through the pipeline.
 */
export function createEmptyTrace(request: NexxTrace['request']): NexxTrace {
  return {
    traceId: randomUUID(),
    request,
    outcome: { success: false },
  };
}

/**
 * Finalize a trace after the request completes.
 * Sets success status and captures timing.
 */
export function finalizeTrace(
  trace: NexxTrace,
  success: boolean,
  startTime: number
): NexxTrace {
  return {
    ...trace,
    performance: {
      ...trace.performance,
      latencyMs: Date.now() - startTime,
    },
    outcome: { success },
  };
}

/**
 * Serialize a trace to JSON for storage in Convex.
 */
export function serializeTrace(trace: NexxTrace): string {
  return JSON.stringify(trace);
}
