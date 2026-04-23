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
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { runDraftingPhase } from '@/lib/export-assembly/pipelineBridge';
import { runPreflightChecks } from '@/lib/export-assembly/validation/preflightValidator';
import type { OrchestratorAssemblyResult, ExportOverrides, DraftedSection } from '@/lib/export-assembly/orchestrator';
import type { ExportRequest, MappingReviewItem } from '@/lib/export-assembly/types/exports';
import type { PreflightResult } from '@/lib/export-assembly/validation/preflightValidator';
import { buildExhibitCoverDraftInputs } from '@/lib/exports/exhibits/buildExhibitCoverDraftInputs';
import { generateExhibitCoverDrafts } from '@/lib/exports/exhibits/generateExhibitCoverDrafts';
import { applyExhibitCoverDrafts } from '@/lib/exports/exhibits/applyExhibitCoverDrafts';
import type { ExhibitMappedSections } from '@/lib/export-assembly/types/exports';
import type { AdaptToCanonicalParams } from '@/lib/exports/adaptDraftedToCanonicalExport';
import { buildExportCaption } from '@/lib/exports/buildExportCaption';
import {
  resolveExportJurisdictionProfile,
} from '@/lib/exports/jurisdiction/resolveExportJurisdictionProfile';
import { generateExportPDF } from '@/lib/exports/generateExportPDF';
import type { ExportPath } from '@/lib/exports/types';
import { hashPayload, generateRunFingerprint } from '@/lib/exports/idempotency';
import { computeArtifactChecksum, verifyUploadedArtifact } from '@/lib/exports/artifactIntegrity';

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

// adaptDraftedToGenerated — REMOVED
// Replaced by adaptDraftedToCanonicalExport from src/lib/exports/
// which preserves structural identity per export path.

/** Derive compliance status from preflight result. */
function deriveComplianceStatus(preflight: PreflightResult): 'pass' | 'warning' | 'error' {
    if (preflight.errorCount > 0) return 'error';
    if (preflight.warningCount > 0) return 'warning';
    return 'pass';
}

// getExportRules — REMOVED
// Replaced by resolveExportJurisdictionProfile + toExportFormattingRules
// from the canonical export pipeline.

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/documents/export/stream
 *
 * Full export pipeline with real-time SSE milestone events.
 * Supports two modes:
 * - **Fast path**: Pre-drafted pasted content → skip GPT → format + render PDF
 * - **Full path**: Workspace data assembly → GPT drafting → format + render PDF
 */
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

    // ── Convex client (established auth pattern) ──
    let convex: ConvexHttpClient;
    try {
        convex = await getAuthenticatedConvexClient();
    } catch {
        return new Response(JSON.stringify({ error: 'Failed to authenticate with Convex' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // ── Create SSE stream ──
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: Record<string, unknown>) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                } catch {
                    // Controller may be closed (client disconnected)
                }
            };

            /** Check if client disconnected; throw to exit pipeline early. */
            const checkAborted = () => {
                if (request.signal.aborted) {
                    throw Object.assign(new Error('Client disconnected'), { code: 'client_aborted' });
                }
            };

            let exportId: string | null = null;
            let runFingerprint: string | null = null;

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
                // 2. DRAFT SECTIONS VIA GPT (or skip for pasted content)
                // ────────────────────────────────────────────────

                // Detect fast path: court_document + synthetic pre_drafted node from ExportContext
                const classifiedNodes = body.assemblyResult?.assembly?.classifiedNodes ?? [];
                const isFastPath = body.exportRequest?.path === 'court_document'
                    && classifiedNodes.length === 1
                    && classifiedNodes[0].tags?.includes('pre_drafted');

                let draftedSections: DraftedSection[];

                if (isFastPath) {
                    // ── FAST PATH: Content is already drafted — skip GPT ──
                    send({
                        type: 'milestone',
                        stage: 'drafting',
                        percent: 65,
                        message: 'Using pre-drafted document content...',
                    });

                    // Respect Review Hub edits and exclusions
                    const nodeId = classifiedNodes[0].nodeId;
                    const itemOverride = body.overrides?.itemOverrides?.find(
                        (o: { nodeId: string }) => o.nodeId === nodeId,
                    );
                    const reviewedItem = body.reviewItems?.find(
                        (item: { nodeId: string }) => item.nodeId === nodeId,
                    );

                    if (itemOverride?.excluded || reviewedItem?.includedInExport === false) {
                        throw Object.assign(
                            new Error('Pasted content was excluded in review. Nothing to export.'),
                            { code: 'draft_failed' },
                        );
                    }

                    const rawText =
                        itemOverride?.editedText
                        ?? reviewedItem?.transformedCourtSafeText
                        ?? reviewedItem?.originalText
                        ?? classifiedNodes[0].rawText;

                    draftedSections = [{
                        sectionId: 'document_body',
                        heading: '',
                        body: rawText,
                        source: 'user_locked' as const,
                    }];
                } else {
                    // ── FULL PATH: Draft via GPT ──
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

                    draftedSections = pipelineResult.draftedSections;
                }

                checkAborted();

                // ────────────────────────────────────────────────
                // 2b. EXHIBIT COVER DRAFTING (exhibit_document only)
                // ────────────────────────────────────────────────
                if (body.exportRequest?.path === 'exhibit_document') {
                    try {
                        send({
                            type: 'milestone',
                            stage: 'drafting',
                            percent: 71,
                            message: 'Drafting exhibit cover summaries...',
                        });

                        const mappedSections = body.assemblyResult?.assembly
                            ?.mappedSections as ExhibitMappedSections | undefined;

                        if (mappedSections?.coverSheetSummaries?.length) {
                            const draftInputs = buildExhibitCoverDraftInputs(
                                mappedSections,
                                {
                                    state: courtState,
                                    county: courtCounty,
                                },
                            );

                            const drafts = await generateExhibitCoverDrafts(draftInputs);

                            // Apply drafts back — mutates nothing, returns new object
                            const patchedSections = applyExhibitCoverDrafts(
                                mappedSections,
                                drafts,
                            );

                            // Store patched sections for downstream exhibit renderer.
                            // Currently the exhibit path renders through draftedSections
                            // (GPT-drafted body content). When the dedicated exhibit
                            // packet renderer is built, it will consume these patched
                            // mappedSections for cover sheet headings/summaries.
                            if (body.assemblyResult?.assembly) {
                                (body.assemblyResult.assembly as { mappedSections: ExhibitMappedSections })
                                    .mappedSections = patchedSections;
                            }

                            // Inject all cover drafts into draftedSections
                            // so the current render path picks up both AI
                            // and fallback summaries.
                            for (const draft of Object.values(drafts)) {
                                if (draft.summaryLines.length > 0) {
                                    draftedSections.push({
                                        sectionId: `exhibit_cover_${draft.label}`,
                                        heading: draft.title || `Exhibit ${draft.label}`,
                                        body: draft.summaryLines.join('\n'),
                                        // DraftedSection.source only supports: ai_drafted | user_locked | user_edited
                                        // Fallback summaries map to user_locked because they are deterministic,
                                        // non-AI content that should not be regenerated — same semantics as locked.
                                        source: draft.source === 'ai_drafted'
                                            ? 'ai_drafted' as const
                                            : 'user_locked' as const,
                                    });
                                }
                            }

                            const aiCount = Object.values(drafts)
                                .filter((d) => d.source === 'ai_drafted').length;
                            const fallbackCount = Object.values(drafts)
                                .filter((d) => d.source === 'raw_fallback_no_ai').length;

                            send({
                                type: 'milestone',
                                stage: 'drafting',
                                percent: 72,
                                message: `Exhibit covers drafted (${aiCount} AI, ${fallbackCount} fallback)`,
                                exhibitCoverDrafting: {
                                    mode: fallbackCount === 0 ? 'ai' : (aiCount === 0 ? 'fallback' : 'mixed'),
                                    count: Object.keys(drafts).length,
                                    aiCount,
                                    fallbackCount,
                                },
                            });
                        } else {
                            // No cover sheet summaries to draft — complete SSE contract
                            send({
                                type: 'milestone',
                                stage: 'drafting',
                                percent: 72,
                                message: 'No exhibit covers to draft',
                                exhibitCoverDrafting: { mode: 'fallback', count: 0, aiCount: 0, fallbackCount: 0 },
                            });
                        }
                    } catch (exhibitErr) {
                        // Advisory — never blocks the export pipeline
                        console.warn('[ExportStream] Exhibit cover drafting failed:', exhibitErr);
                        send({
                            type: 'milestone',
                            stage: 'drafting',
                            percent: 72,
                            message: 'Exhibit cover drafting skipped (using defaults)',
                            exhibitCoverDrafting: { mode: 'fallback', count: 0, aiCount: 0, fallbackCount: 0 },
                        });
                    }
                }

                const aiDraftedCount = draftedSections.filter(s => s.source === 'ai_drafted').length;
                const lockedCount = draftedSections.filter(s => s.source === 'user_locked').length;

                // Persist draft output
                await convex.mutation(api.generatedDocumentsExport.updateExportRun, {
                    exportId: exportId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                    status: 'preflight',
                    currentStage: 'draft',
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
                        isFastPath,
                    });
                } catch (pfErr) {
                    // Preflight failure is non-blocking (advisory)
                    console.warn('[ExportStream] Preflight check failed:', pfErr);
                    preflightResult = {
                        checks: [],
                        criticalCount: 0,
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
                    currentStage: 'preflight',
                    preflightJson: JSON.stringify({
                        schemaVersion: 1,
                        result: preflightResult,
                    }),
                    preflightSchemaVersion: 1,
                    complianceStatus,
                });

                send({
                    type: 'milestone',
                    stage: 'rendering_html',
                    percent: 78,
                    message: 'Building canonical document...',
                });

                checkAborted();

                // Build full jurisdiction settings object — shared between
                // pre-adaptation profile resolve and the orchestrator.
                // Includes profileKey and overrides so both get the same profile.
                const profileKey = ('profileKey' in exportConfig ? String(exportConfig.profileKey) : undefined) ?? undefined;
                const jurisdictionSettings = {
                    state: courtState,
                    county: courtCounty,
                    profileKey,
                };

                // 4a. Resolve jurisdiction profile (for caption/exhibit setup)
                const exportProfile = resolveExportJurisdictionProfile(jurisdictionSettings);

                // 4b. Build caption for court documents
                const exportPath = (body.exportRequest?.path ?? 'court_document') as ExportPath;
                const caption = exportPath === 'court_document'
                    ? buildExportCaption({
                        style: exportProfile.court.captionStyle,
                        courtName: undefined,
                        causeNumber,
                        petitionerName,
                        respondentName,
                        state: courtState,
                        county: courtCounty,
                    })
                    : null;

                // 4c. Build adapt params
                const mappedSections = body.assemblyResult?.assembly
                    ?.mappedSections as ExhibitMappedSections | undefined;

                const adaptParams: AdaptToCanonicalParams = {
                    path: exportPath,
                    title: getTemplateName(body.exportRequest?.path ?? 'general').toUpperCase(),
                    draftedSections: draftedSections.map((s) => ({
                        sectionId: s.sectionId,
                        heading: s.heading,
                        body: s.body,
                        numberedItems: s.numberedItems,
                        source: s.source,
                    })),
                    caseId: body.caseId,
                    causeNumber,
                    jurisdiction: { state: courtState, county: courtCounty },
                    partyRole: undefined,
                    documentType: caseType,
                    caption,
                    signature: exportPath === 'court_document'
                        ? {
                            intro: 'Respectfully submitted,',
                            signerLines: [
                                `_________________________`,
                                petitionerName,
                                'Pro Se',
                            ],
                        }
                        : null,
                    certificate: exportPath === 'court_document'
                        ? {
                            heading: 'CERTIFICATE OF SERVICE',
                            bodyLines: [
                                `I certify that a true and correct copy of the foregoing was served on all parties of record in accordance with the applicable rules of procedure.`,
                            ],
                            signerLines: [
                                `_________________________`,
                                petitionerName,
                            ],
                        }
                        : null,
                    exhibitMappedSections: exportPath === 'exhibit_document'
                        ? mappedSections ?? null
                        : null,
                    exhibitPacket: exportPath === 'exhibit_document'
                        ? {
                            packetTitle: getTemplateName('exhibit_document'),
                            organizationMode: 'chronological',
                            labelStyle: exportProfile.exhibit.labelStyleDefault,
                        }
                        : null,
                };

                // ────────────────────────────────────────────────
                // 4d. IDEMPOTENCY CHECK
                // ────────────────────────────────────────────────
                const payloadHash = hashPayload({
                    adaptParams,
                    jurisdictionSettings,
                    caseType,
                    exportPath,
                });
                runFingerprint = generateRunFingerprint({
                    caseId: body.caseId,
                    exportPath,
                    payloadHash,
                });

                const claimResult = await convex.mutation(api.exportRuns.claimExportRun, {
                    fingerprint: runFingerprint,
                    caseId: body.caseId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                    exportPath,
                });

                if (claimResult.status === 'already_completed') {
                    // Duplicate request — return existing export
                    send({
                        type: 'complete',
                        exportId: claimResult.exportId,
                        reused: true,
                        message: 'Export already completed — returning cached result.',
                    });
                    return;
                }

                if (claimResult.status === 'in_progress') {
                    throw Object.assign(
                        new Error('Duplicate export request — generation already in progress'),
                        { code: 'EXPORT_IDEMPOTENCY_CONFLICT' },
                    );
                }

                send({
                    type: 'milestone',
                    stage: 'rendering_html',
                    percent: 80,
                    message: 'Rendering document HTML...',
                });

                // 4e-5. Delegate rendering pipeline to orchestrator
                send({
                    type: 'milestone',
                    stage: 'rendering_pdf',
                    percent: 85,
                    message: 'Generating PDF...',
                });

                const pipelineResult = await generateExportPDF({
                    adaptParams,
                    jurisdictionSettings,
                    resolvedProfile: exportProfile,
                    causeNumber,
                    metadata: { caseType, exportPath, runId: body.runId },
                });

                const pdfBuffer = pipelineResult.pdfBuffer;

                // Checkpoint: rendering complete
                await convex.mutation(api.generatedDocumentsExport.updateExportRun, {
                    exportId: exportId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                    status: 'saving',
                    currentStage: 'render',
                });

                checkAborted();

                // ────────────────────────────────────────────────
                // 6. UPLOAD PDF TO CONVEX STORAGE
                // ────────────────────────────────────────────────
                send({
                    type: 'milestone',
                    stage: 'saving',
                    percent: 92,
                    message: 'Uploading to storage...',
                });

                const filename = pipelineResult.filename;

                // Get upload URL from Convex
                const uploadUrl = await convex.mutation(api.generatedDocumentsExport.generateExportUploadUrl, {});

                // Upload PDF buffer (convert Buffer to Uint8Array for fetch compatibility)
                const uploadResponse = await fetch(uploadUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/pdf' },
                    body: new Uint8Array(pdfBuffer),
                    signal: request.signal,
                });

                if (!uploadResponse.ok) {
                    throw Object.assign(new Error('PDF upload to storage failed'), { code: 'upload_failed' });
                }

                const uploadResult = await uploadResponse.json();
                const storageId = uploadResult?.storageId;

                if (!storageId) {
                    throw Object.assign(
                        new Error('Storage upload returned no storageId'),
                        { code: 'upload_failed' },
                    );
                }

                // ────────────────────────────────────────────────
                // 6b. ARTIFACT INTEGRITY VERIFICATION
                // ────────────────────────────────────────────────
                const preUploadChecksum = computeArtifactChecksum(pdfBuffer);
                const verification = verifyUploadedArtifact({
                    storageId,
                    reportedByteLength: pdfBuffer.length,
                    expectedByteLength: pdfBuffer.length,
                    checksum: preUploadChecksum,
                });

                if (!verification.verified) {
                    console.error('[ExportStream] Artifact integrity check failed:', verification);
                    throw Object.assign(
                        new Error(`Artifact integrity verification failed: byteLengthMatch=${verification.byteLengthMatch}, storageIdValid=${verification.storageIdValid}`),
                        { code: 'EXPORT_ARTIFACT_INTEGRITY_FAILED' },
                    );
                }

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
                    sha256: preUploadChecksum,
                });

                // ────────────────────────────────────────────────
                // 8. EMIT COMPLETE
                // ────────────────────────────────────────────────
                // Mark idempotency run as completed
                if (runFingerprint) {
                    try {
                        await convex.mutation(api.exportRuns.completeExportRun, {
                            fingerprint: runFingerprint,
                            exportId: exportId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                        });
                    } catch (idempErr) {
                        console.warn('[ExportStream] Failed to complete idempotency run:', idempErr);
                    }
                }

                send({
                    type: 'complete',
                    exportId,
                    filename,
                    sectionCount: draftedSections.length,
                    aiDraftedCount,
                    lockedCount,
                    preflightSummary: preflightResult,
                    artifactVerified: verification.verified,
                    sha256: preUploadChecksum,
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

                // Mark idempotency run as failed (allows retry)
                if (runFingerprint) {
                    try {
                        await convex.mutation(api.exportRuns.failExportRun, {
                            fingerprint: runFingerprint,
                            errorCode,
                        });
                    } catch (idempErr) {
                        console.warn('[ExportStream] Failed to mark idempotency run as failed:', idempErr);
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
    if (msg.includes('client_aborted') || msg.includes('client disconnected')) return 'client_aborted';
    if (msg.includes('draft') || msg.includes('openai') || msg.includes('gpt')) return 'draft_failed';
    if (msg.includes('preflight')) return 'preflight_failed';
    if (msg.includes('pdf') || msg.includes('puppeteer') || msg.includes('chromium')) return 'render_pdf_failed';
    if (msg.includes('html') || msg.includes('template')) return 'render_html_failed';
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

// buildFallbackHTML — REMOVED
// Replaced by the canonical export pipeline:
//   adaptDraftedToCanonicalExport → renderExportHTML (path dispatcher)
// The generic fallback is no longer needed because every export path
// now has a dedicated, path-specific renderer.

// escapeHtml — REMOVED
// Moved to shared renderer primitives at src/lib/exports/renderers/shared.ts
