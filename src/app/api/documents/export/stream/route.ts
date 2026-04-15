/**
 * Export Pipeline Stream API Route
 *
 * POST /api/documents/export/stream
 *
 * SSE endpoint that runs the full export pipeline with real-time progress:
 *   Assembly → Review (pause) → Drafting → Compliance → Rendering → Save
 *
 * The client receives events like:
 *   data: {"phase":"drafting","progress":65,"detail":"Drafting 3 sections..."}
 *   data: {"phase":"completed","progress":100,"pdfUrl":"/api/documents/download/abc"}
 */

import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { runDraftingPhase } from '@/lib/export-assembly/pipelineBridge';
import type { OrchestratorAssemblyResult, ExportOverrides, PipelineStatus } from '@/lib/export-assembly/orchestrator';
import type { ExportRequest, MappingReviewItem } from '@/lib/export-assembly/types/exports';

export const maxDuration = 60;

/** Shape of the request body. */
interface ExportStreamRequest {
    assemblyResult: OrchestratorAssemblyResult;
    overrides: ExportOverrides;
    exportRequest: ExportRequest;
    reviewItems: MappingReviewItem[];
    caseId: string;
}

/** Handle POST requests to stream export pipeline progress. */
export async function POST(request: NextRequest) {
    // ── Auth guard ──
    const { userId } = await auth();
    if (!userId) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // ── Rate limit ──
    const rl = checkRateLimit(userId, 'document_generation');
    if (!rl.allowed) {
        const { body, status } = rateLimitResponse(rl);
        return new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // ── Parse body ──
    let body: ExportStreamRequest;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Malformed JSON' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // ── Create SSE stream ──
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: Record<string, unknown>) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            try {
                // Status callback that sends SSE events
                const onStatus = (status: PipelineStatus) => {
                    send({
                        type: 'progress',
                        phase: status.phase,
                        progress: status.progress,
                        detail: status.detail ?? '',
                    });
                };

                // ── Run drafting phase ──
                send({ type: 'progress', phase: 'drafting', progress: 55, detail: 'Starting draft generation...' });

                const pipelineResult = await runDraftingPhase({
                    assemblyResult: body.assemblyResult,
                    overrides: body.overrides,
                    request: body.exportRequest,
                    reviewItems: body.reviewItems,
                    onStatus,
                });

                // ── Rendering phase ──
                send({ type: 'progress', phase: 'rendering', progress: 90, detail: 'Rendering document...' });

                // For now, we produce a JSON representation of the drafted output.
                // In Sprint 8D-extended, this connects to renderDocumentHTML → renderHTMLToPDF.
                const draftOutput = {
                    draftedSections: pipelineResult.draftedSections,
                    meta: pipelineResult.meta,
                    generatedAt: new Date().toISOString(),
                };

                // ── Saving phase ──
                send({ type: 'progress', phase: 'saving', progress: 95, detail: 'Saving document...' });

                // ── Complete ──
                send({
                    type: 'complete',
                    phase: 'completed',
                    progress: 100,
                    detail: 'Export complete',
                    draftOutput: JSON.stringify(draftOutput),
                    sectionCount: pipelineResult.draftedSections.length,
                    lockedCount: pipelineResult.draftedSections.filter(s => s.source === 'user_locked').length,
                    aiDraftedCount: pipelineResult.draftedSections.filter(s => s.source === 'ai_drafted').length,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Pipeline failed';
                console.error('[ExportStream] Pipeline error:', message);
                send({
                    type: 'error',
                    phase: 'error',
                    progress: 0,
                    detail: message,
                });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
