/**
 * Export Pipeline Stream API Route
 *
 * POST /api/documents/export/stream
 *
 * Full export pipeline with real-time SSE milestone events:
 *   1. Create export record (status: drafting)
 *   2. Draft sections via GPT (pipelineBridge)
 *   3. Run auto-preflight (preflightValidator)
 *   4. Render HTML (adapt → existing templateRenderer)
 *   5. Render PDF (existing pdfRenderer)
 *   6. Upload PDF to Convex storage
 *   7. Finalize export record
 *   8. Emit structured COMPLETE event with exportId
 *
 * SSE Milestone Contract:
 *   { type: 'milestone', stage, percent, message, ... }
 *   { type: 'complete', exportId, filename, ... }
 *   { type: 'error', errorCode, message }
 */

import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@convex/_generated/api';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { runDraftingPhase } from '@/lib/export-assembly/pipelineBridge';
import { runPreflightChecks } from '@/lib/export-assembly/validation/preflightValidator';
import { renderDocumentHTML } from '@/lib/legal/templateRenderer';
import { renderHTMLToPDF } from '@/lib/legal/pdfRenderer';
import { getMergedRules } from '@/lib/legal/courtRules';
import { getTemplate } from '@/lib/legal/templates';
import type { GeneratedSection, CourtFormattingRules } from '@/lib/legal/types';
import type { OrchestratorAssemblyResult, ExportOverrides, DraftedSection } from '@/lib/export-assembly/orchestrator';
import type { ExportRequest, MappingReviewItem } from '@/lib/export-assembly/types/exports';
import type { PreflightResult } from '@/lib/export-assembly/validation/preflightValidator';

export const maxDuration = 120; // Extended for GPT + PDF rendering

// ---------------------------------------------------------------------------
// Request Types
// ---------------------------------------------------------------------------

interface ExportStreamRequest {
    assemblyResult: OrchestratorAssemblyResult;
    overrides: ExportOverrides;
    exportRequest: ExportRequest;
    reviewItems: MappingReviewItem[];
    caseId: string;
    runId: string;
    retryOfExportId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sanitize a string for use in filenames. */
function sanitizeForFilename(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

/** Generate a deterministic filename: {caseType}_{exportPath}_{date}_{shortId}.pdf */
function generateFilename(caseType: string, exportPath: string, runId: string): string {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const shortId = runId.slice(-6);
    return `${sanitizeForFilename(caseType)}_${sanitizeForFilename(exportPath)}_${date}_${shortId}.pdf`;
}

/**
 * Adapt DraftedSection[] → GeneratedSection[] for the existing templateRenderer.
 *
 * This is a THIN ADAPTER, not a parallel formatting engine. The existing
 * renderDocumentHTML() does all the real work.
 */
function adaptDraftedToGenerated(sections: DraftedSection[]): GeneratedSection[] {
    return sections.map(s => ({
        sectionId: s.sectionId,
        sectionType: 'body_sections' as const,
        heading: s.heading,
        content: s.body,
        numberedItems: s.numberedItems,
    }));
}

/** Derive compliance status from preflight result. */
function deriveComplianceStatus(preflight: PreflightResult): 'pass' | 'warning' | 'error' {
    if (preflight.errorCount > 0) return 'error';
    if (preflight.warningCount > 0) return 'warning';
    return 'pass';
}

/** Get default court formatting rules for rendering. */
function getExportRules(request: ExportRequest): CourtFormattingRules {
    if (request.path === 'court_document' && request.config && 'courtState' in request.config) {
        const config = request.config as { courtState?: string; courtCounty?: string };
        return getMergedRules(
            config.courtState ?? 'Texas',
            config.courtCounty ?? 'Harris',
            {},
        );
    }
    // Default rules for non-court documents
    return getMergedRules('Texas', 'Harris', {});
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

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

    if (!body.runId || !body.caseId) {
        return new Response(JSON.stringify({ error: 'Missing runId or caseId' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // ── Convex client ──
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    // Forward the Clerk token for authenticated mutations
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '');
    if (authToken) {
        convex.setAuth(authToken);
    }

    // ── Create SSE stream ──
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: Record<string, unknown>) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                } catch {
                    // Controller may be closed
                }
            };

            let exportId: string | null = null;

            try {
                // ────────────────────────────────────────────────
                // 1. CREATE EXPORT RECORD
                // ────────────────────────────────────────────────
                send({
                    type: 'milestone',
                    stage: 'drafting',
                    percent: 50,
                    message: 'Initializing export...',
                });

                const exportConfig = body.exportRequest?.config ?? {};
                const courtState = ('courtState' in exportConfig ? String(exportConfig.courtState) : undefined) ?? 'Texas';
                const courtCounty = ('courtCounty' in exportConfig ? String(exportConfig.courtCounty) : undefined) ?? '';
                const petitionerName = ('petitionerName' in exportConfig ? String(exportConfig.petitionerName) : undefined) ?? 'Petitioner';
                const respondentName = ('respondentName' in exportConfig ? String(exportConfig.respondentName) : undefined) ?? undefined;
                const causeNumber = ('causeNumber' in exportConfig ? String(exportConfig.causeNumber) : undefined) ?? undefined;
                const caseType = ('caseType' in exportConfig ? String(exportConfig.caseType) : undefined) ?? body.exportRequest?.path ?? 'general';

                exportId = await convex.mutation(api.generatedDocumentsExport.createExportRun, {
                    caseId: body.caseId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                    runId: body.runId,
                    templateId: `export_${body.exportRequest?.path ?? 'general'}`,
                    templateTitle: getTemplateName(body.exportRequest?.path ?? 'general'),
                    caseType,
                    courtState,
                    courtCounty,
                    petitionerName,
                    respondentName,
                    causeNumber,
                    exportPath: body.exportRequest?.path ?? 'general',
                    retryOfExportId: body.retryOfExportId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                    exportConfigJson: JSON.stringify({
                        schemaVersion: 1,
                        config: body.exportRequest,
                    }),
                    assemblySnapshotJson: JSON.stringify({
                        schemaVersion: 1,
                        meta: body.assemblyResult?.meta,
                        classifiedNodeCount: body.assemblyResult?.assembly?.classifiedNodes?.length ?? 0,
                    }),
                    model: 'gpt-5.4',
                });

                // ────────────────────────────────────────────────
                // 2. DRAFT SECTIONS VIA GPT
                // ────────────────────────────────────────────────
                send({
                    type: 'milestone',
                    stage: 'drafting',
                    percent: 55,
                    message: 'Drafting sections with AI...',
                });

                const pipelineResult = await runDraftingPhase({
                    assemblyResult: body.assemblyResult,
                    overrides: body.overrides,
                    request: body.exportRequest,
                    reviewItems: body.reviewItems,
                    onStatus: (status) => {
                        send({
                            type: 'milestone',
                            stage: 'drafting',
                            percent: Math.min(status.progress, 70),
                            message: status.detail ?? 'Drafting...',
                        });
                    },
                });

                const { draftedSections } = pipelineResult;
                const aiDraftedCount = draftedSections.filter(s => s.source === 'ai_drafted').length;
                const lockedCount = draftedSections.filter(s => s.source === 'user_locked').length;

                // Persist draft output
                await convex.mutation(api.generatedDocumentsExport.updateExportRun, {
                    exportId: exportId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                    status: 'preflight',
                    draftOutputJson: JSON.stringify({
                        schemaVersion: 1,
                        sections: draftedSections,
                    }),
                    draftSchemaVersion: 1,
                    sectionCount: draftedSections.length,
                    aiDraftedCount,
                    lockedCount,
                });

                // ────────────────────────────────────────────────
                // 3. AUTO PREFLIGHT
                // ────────────────────────────────────────────────
                send({
                    type: 'milestone',
                    stage: 'preflight',
                    percent: 72,
                    message: 'Running preflight checks...',
                });

                let preflightResult: PreflightResult;
                try {
                    preflightResult = runPreflightChecks({
                        exportPath: body.exportRequest?.path ?? 'court_document',
                        config: (body.exportRequest?.config ?? {}) as unknown as Record<string, unknown>,
                        reviewItems: body.reviewItems,
                        overrides: body.overrides,
                    });
                } catch (pfErr) {
                    // Preflight failure is non-blocking (advisory)
                    console.warn('[ExportStream] Preflight check failed:', pfErr);
                    preflightResult = {
                        checks: [],
                        errorCount: 0,
                        warningCount: 0,
                        readinessScore: 0,
                        canProceed: true,
                    };
                }

                const complianceStatus = deriveComplianceStatus(preflightResult);

                send({
                    type: 'milestone',
                    stage: 'preflight',
                    percent: 76,
                    message: `Preflight: ${preflightResult.checks.length} checks (${complianceStatus})`,
                    preflightResult,
                });

                // Persist preflight
                await convex.mutation(api.generatedDocumentsExport.updateExportRun, {
                    exportId: exportId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                    status: 'rendering',
                    preflightJson: JSON.stringify({
                        schemaVersion: 1,
                        result: preflightResult,
                    }),
                    preflightSchemaVersion: 1,
                    complianceStatus,
                });

                // ────────────────────────────────────────────────
                // 4. RENDER HTML (via existing templateRenderer)
                // ────────────────────────────────────────────────
                send({
                    type: 'milestone',
                    stage: 'rendering_html',
                    percent: 80,
                    message: 'Rendering document HTML...',
                });

                const rules = getExportRules(body.exportRequest);
                const generatedSections = adaptDraftedToGenerated(draftedSections);

                // Try to use a matching template, fall back to a simple body-only render
                const templateId = `export_${body.exportRequest?.path ?? 'general'}`;
                const template = getTemplate(templateId) ?? getTemplate('court_filing_generic');

                let html: string;
                if (template) {
                    html = renderDocumentHTML({
                        template,
                        caption: {
                            causeNumber: causeNumber ?? '_______________',
                            leftLines: [petitionerName.toUpperCase()],
                            rightLines: [`${courtState.toUpperCase()} COUNTY`],
                            style: courtState === 'Texas' ? 'section-symbol' : 'versus',
                        },
                        titleText: getTemplateName(body.exportRequest?.path ?? 'general').toUpperCase(),
                        bodyContent: generatedSections,
                        petitioner: { name: petitionerName, role: 'Pro Se', type: 'party' as const, electronicSignature: false },
                        respondentName,
                        rules,
                    });
                } else {
                    // Fallback: simple HTML from drafted sections (still uses court CSS)
                    html = buildFallbackHTML(draftedSections, rules, getTemplateName(body.exportRequest?.path ?? 'general'));
                }

                // ────────────────────────────────────────────────
                // 5. RENDER PDF (via existing pdfRenderer)
                // ────────────────────────────────────────────────
                send({
                    type: 'milestone',
                    stage: 'rendering_pdf',
                    percent: 85,
                    message: 'Generating PDF...',
                });

                const pdfBuffer = await renderHTMLToPDF(html, rules, causeNumber);

                // ────────────────────────────────────────────────
                // 6. UPLOAD PDF TO CONVEX STORAGE
                // ────────────────────────────────────────────────
                send({
                    type: 'milestone',
                    stage: 'saving',
                    percent: 92,
                    message: 'Uploading to storage...',
                });

                const filename = generateFilename(caseType, body.exportRequest?.path ?? 'general', body.runId);

                // Get upload URL from Convex
                const uploadUrl = await convex.mutation(api.generatedDocumentsExport.generateExportUploadUrl, {});

                // Upload PDF buffer (convert Buffer to Uint8Array for fetch compatibility)
                const uploadResponse = await fetch(uploadUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/pdf' },
                    body: new Uint8Array(pdfBuffer),
                });

                if (!uploadResponse.ok) {
                    throw Object.assign(new Error('PDF upload to storage failed'), { code: 'upload_failed' });
                }

                const { storageId } = await uploadResponse.json();

                // ────────────────────────────────────────────────
                // 7. FINALIZE EXPORT RECORD
                // ────────────────────────────────────────────────
                send({
                    type: 'milestone',
                    stage: 'saving',
                    percent: 96,
                    message: 'Saving export record...',
                });

                await convex.mutation(api.generatedDocumentsExport.finalizeExportRun, {
                    exportId: exportId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                    storageId: storageId,
                    filename,
                    byteSize: pdfBuffer.length,
                    mimeType: 'application/pdf',
                });

                // ────────────────────────────────────────────────
                // 8. EMIT COMPLETE
                // ────────────────────────────────────────────────
                send({
                    type: 'complete',
                    exportId,
                    filename,
                    sectionCount: draftedSections.length,
                    aiDraftedCount,
                    lockedCount,
                    preflightSummary: preflightResult,
                });

            } catch (error) {
                // ── Error handling with typed codes ──
                const errorObj = error as Error & { code?: string };
                const errorCode = errorObj.code ?? classifyError(errorObj);
                const message = errorObj.message ?? 'Pipeline failed';

                console.error(`[ExportStream] Pipeline error (${errorCode}):`, message);

                // Persist failure if we have an export record
                if (exportId) {
                    try {
                        await convex.mutation(api.generatedDocumentsExport.failExportRun, {
                            exportId: exportId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                            errorCode,
                            errorMessage: message,
                        });
                    } catch (failErr) {
                        console.error('[ExportStream] Failed to persist error state:', failErr);
                    }
                }

                send({
                    type: 'error',
                    errorCode,
                    message,
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

// ---------------------------------------------------------------------------
// Error Classification
// ---------------------------------------------------------------------------

/** Classify error into typed error code based on message/stack. */
function classifyError(error: Error): string {
    const msg = error.message?.toLowerCase() ?? '';
    if (msg.includes('draft') || msg.includes('openai') || msg.includes('gpt')) return 'draft_failed';
    if (msg.includes('preflight')) return 'preflight_failed';
    if (msg.includes('html') || msg.includes('template') || msg.includes('render')) return 'render_html_failed';
    if (msg.includes('pdf') || msg.includes('puppeteer') || msg.includes('chromium')) return 'render_pdf_failed';
    if (msg.includes('upload') || msg.includes('storage')) return 'upload_failed';
    if (msg.includes('save') || msg.includes('mutation') || msg.includes('convex')) return 'save_failed';
    return 'unknown_failed';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get a human-readable template name for the export path. */
function getTemplateName(exportPath: string): string {
    switch (exportPath) {
        case 'court_document': return 'Court Filing Document';
        case 'case_summary': return 'Case Summary Report';
        case 'exhibit_document': return 'Exhibit Packet';
        default: return 'Legal Document';
    }
}

/**
 * Fallback HTML when no matching template is found.
 * Uses the existing court CSS but with a simple section layout.
 * This is NOT a parallel renderer — it's a minimal fallback.
 */
function buildFallbackHTML(sections: DraftedSection[], rules: CourtFormattingRules, title: string): string {
    const sectionHTML = sections.map(s => `
        <div class="section-heading">${escapeHtml(s.heading)}</div>
        <div class="body-paragraph">${escapeHtml(s.body)}</div>
    `).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: '${rules.fontFamily}', 'Times New Roman', serif;
      font-size: ${rules.fontSize}pt;
      line-height: ${rules.lineSpacing};
    }
    .document-title {
      text-align: center;
      font-weight: bold;
      font-size: 14pt;
      margin: 24pt 0;
      text-transform: uppercase;
    }
    .section-heading {
      font-weight: bold;
      margin: 18pt 0 6pt;
      text-transform: uppercase;
    }
    .body-paragraph {
      text-align: ${rules.bodyAlignment};
      text-indent: ${rules.paragraphIndent}in;
      margin-bottom: 12pt;
    }
  </style>
</head>
<body>
  <div class="document-title">${escapeHtml(title)}</div>
  ${sectionHTML}
</body>
</html>`;
}

/** Escape HTML special characters. */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
