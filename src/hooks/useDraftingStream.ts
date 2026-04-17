/**
 * useDraftingStream — SSE client hook for the export drafting pipeline.
 *
 * Connects ReviewHubContent → /api/documents/export/stream:
 *   1. Generates client-side runId for deduplication
 *   2. POSTs pipeline input to SSE endpoint
 *   3. Reads structured milestone events
 *   4. Dispatches into ExportContext (DRAFT_PROGRESS, SET_PREFLIGHT, COMPLETE, ERROR)
 *   5. Supports AbortController for cancellation on navigate-away
 *   6. Ignores stale SSE events from previous runs via runId comparison
 */

'use client';

import { useCallback, useRef } from 'react';
import type { DraftingStage } from '@/app/(app)/docuvault/context/ExportContext';
import type { OrchestratorAssemblyResult, ExportOverrides, PipelineStatus } from '@/lib/export-assembly/orchestrator';
import type { ExportRequest, MappingReviewItem } from '@/lib/export-assembly/types/exports';
import type { PreflightResult } from '@/lib/export-assembly/validation/preflightValidator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input to start the drafting stream. */
export interface DraftStreamInput {
    assemblyResult: OrchestratorAssemblyResult;
    overrides: ExportOverrides;
    exportRequest: ExportRequest;
    reviewItems: MappingReviewItem[];
    caseId: string;
    /** Optional: if retrying a previous export */
    retryOfExportId?: string;
}

/** Structured SSE milestone event from the server. */
interface SSEMilestoneEvent {
    type: 'milestone';
    stage: DraftingStage;
    percent: number;
    message: string;
    sectionCount?: number;
    preflightResult?: PreflightResult;
}

/** SSE complete event from the server. */
interface SSECompleteEvent {
    type: 'complete';
    exportId: string;
    filename: string;
    sectionCount: number;
    aiDraftedCount: number;
    lockedCount: number;
    preflightSummary: PreflightResult;
}

/** SSE error event from the server. */
interface SSEErrorEvent {
    type: 'error';
    errorCode: string;
    message: string;
}

type SSEEvent = SSEMilestoneEvent | SSECompleteEvent | SSEErrorEvent;

/** Dispatch functions from ExportContext. */
interface ContextDispatchers {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dispatch: React.Dispatch<any>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDraftingStream({ dispatch }: ContextDispatchers) {
    const abortRef = useRef<AbortController | null>(null);
    const activeRunIdRef = useRef<string | null>(null);

    /** Generate a unique run ID. */
    const generateRunId = () =>
        `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    /** Start the SSE drafting stream. Returns the runId. */
    const startStream = useCallback(async (input: DraftStreamInput): Promise<string> => {
        // Abort any previous stream
        abortRef.current?.abort();

        const runId = generateRunId();
        activeRunIdRef.current = runId;

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const response = await fetch('/api/documents/export/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...input,
                    runId,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                let errorMessage: string = `Server error ${response.status}`;
                try {
                    const errorBody = JSON.parse(errorText) as { error?: unknown; message?: unknown };
                    const candidate = errorBody.error ?? errorBody.message;
                    if (typeof candidate === 'string' && candidate.trim()) {
                        errorMessage = candidate.trim().slice(0, 500);
                    } else if (candidate != null) {
                        errorMessage = JSON.stringify(candidate).slice(0, 500);
                    }
                } catch {
                    const trimmed = errorText.trim();
                    if (trimmed) errorMessage = trimmed.slice(0, 500);
                }
                console.error('[useDraftingStream] Non-OK response:', response.status, errorMessage);
                dispatch({
                    type: 'ERROR',
                    message: errorMessage,
                    errorCode: 'unknown_failed',
                });
                return runId;
            }

            if (!response.body) {
                dispatch({
                    type: 'ERROR',
                    message: 'No response stream received',
                    errorCode: 'unknown_failed',
                });
                return runId;
            }

            // Read SSE stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Check if this run is still active (stale check)
                if (activeRunIdRef.current !== runId) {
                    reader.cancel();
                    break;
                }

                buffer += decoder.decode(value, { stream: true });

                // Parse SSE data lines
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;

                    let event: SSEEvent;
                    try {
                        event = JSON.parse(line.slice(6));
                    } catch {
                        console.warn('[useDraftingStream] Malformed SSE event:', line);
                        continue;
                    }

                    // Final stale check per event
                    if (activeRunIdRef.current !== runId) break;

                    switch (event.type) {
                        case 'milestone':
                            dispatch({
                                type: 'DRAFT_PROGRESS',
                                status: {
                                    phase: (event.stage ?? 'drafting') as PipelineStatus['phase'],
                                    progress: event.percent,
                                    detail: event.message,
                                },
                                stage: event.stage,
                            });
                            // If preflight result is attached, dispatch it
                            if (event.preflightResult) {
                                dispatch({
                                    type: 'SET_PREFLIGHT',
                                    result: event.preflightResult,
                                });
                            }
                            break;

                        case 'complete':
                            dispatch({
                                type: 'COMPLETE',
                                exportId: event.exportId,
                                filename: event.filename,
                            });
                            // Also set final preflight
                            if (event.preflightSummary) {
                                dispatch({
                                    type: 'SET_PREFLIGHT',
                                    result: event.preflightSummary,
                                });
                            }
                            break;

                        case 'error':
                            dispatch({
                                type: 'ERROR',
                                message: event.message,
                                errorCode: event.errorCode,
                            });
                            break;
                    }
                }
            }
        } catch (err) {
            // AbortError is expected when user navigates away
            if (err instanceof DOMException && err.name === 'AbortError') {
                return runId;
            }
            dispatch({
                type: 'ERROR',
                message: err instanceof Error ? err.message : 'Stream connection failed',
                errorCode: 'unknown_failed',
            });
        }

        return runId;
    }, [dispatch]);

    /** Abort the active stream (stops listening, server continues). */
    const abort = useCallback(() => {
        abortRef.current?.abort();
        activeRunIdRef.current = null;
    }, []);

    return { startStream, abort, activeRunIdRef };
}
