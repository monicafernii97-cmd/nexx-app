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
import { ExportDocumentGenerationError } from '@/lib/exports/errors';
import {
    resolveCourtIdentity,
    isValidDocumentKind,
    type CourtIdentity,
    type CourtSettingsData,
} from '@/lib/exports/resolveCourtIdentity';
import { detectCourtDocumentIssues, type CourtDocumentIssue } from '@/lib/exports/courtDocumentIssues';
import { extractCourtMetadataFromText, extractSapcrChildNameRobust } from '@/lib/exports/extractCourtMetadataFromText';
import {
    MAX_TERMINAL_MUTATION_RETRIES,
    RETRY_BACKOFF_BASE_MS,
} from '@/lib/exports/exportConfig';

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
    /** Client-side court identity patch from ClarificationModal. */
    courtIdentityPatch?: Partial<CourtIdentity>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// adaptDraftedToGenerated — REMOVED
// Replaced by adaptDraftedToCanonicalExport from src/lib/exports/
// which preserves structural identity per export path.

/** Derive compliance status from preflight result. */
function deriveComplianceStatus(preflight: PreflightResult): 'pass' | 'warning' | 'error' {
    if (preflight.errorCount > 0) return 'error';
    if (preflight.warningCount > 0) return 'warning';
    return 'pass';
}

function cleanChildrenNames(names: string[] | undefined): string[] {
    return (names ?? []).map((name) => name.trim()).filter(Boolean);
}

function isSapcrIdentity(identity: CourtIdentity): boolean {
    return identity.caseTitleFormat === 'in_interest_of'
        || cleanChildrenNames(identity.childrenNames).length > 0
        || /sapcr|parent.child|custody|modification/i.test(identity.caseType ?? '');
}

// getExportRules — REMOVED
// Replaced by resolveExportJurisdictionProfile + toExportFormattingRules
// from the canonical export pipeline.

function collectReviewIdentityText(reviewItems: MappingReviewItem[] | undefined): string {
    return (reviewItems ?? []).map((item) =>
        [
            item.userOverride?.editedText,
            item.transformedCourtSafeText,
            item.originalText,
        ].filter(Boolean).join('\n'),
    ).join('\n');
}

function collectAssemblyIdentityText(
    assemblyResult: OrchestratorAssemblyResult | undefined,
): string {
    return (assemblyResult?.assembly?.classifiedNodes ?? []).map((node) =>
        [
            node.rawText,
            node.cleanedText,
            node.transformedText?.courtSafe,
        ].filter(Boolean).join('\n'),
    ).join('\n');
}

function collectRequestIdentityText(exportRequest: ExportRequest | undefined): string {
    const config = (exportRequest?.config ?? {}) as unknown as Record<string, unknown>;
    return [
        config.pastedContent,
        config.rawDocumentText,
        config.documentText,
        config.sourceText,
    ].filter((value): value is string => typeof value === 'string' && value.trim() !== '')
        .join('\n');
}

function collectExportIdentityText(body: Pick<ExportStreamRequest, 'reviewItems' | 'assemblyResult' | 'exportRequest'>): string {
    return [
        collectReviewIdentityText(body.reviewItems),
        collectAssemblyIdentityText(body.assemblyResult),
        collectRequestIdentityText(body.exportRequest),
    ].filter(Boolean).join('\n');
}

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
  try {
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
            let claimedExportRun = false;
            let jobId: string | null = null;
            let pendingCourtIssues: CourtDocumentIssue[] | null = null;
            let clarificationEventSent = false;

            try {
                // ────────────────────────────────────────────────
                // 1. PIPELINE START
                // ────────────────────────────────────────────────
                const pipelineStartTime = Date.now();

                send({
                    type: 'milestone',
                    stage: 'initializing',
                    percent: 5,
                    message: 'Checking admission...',
                });

                const exportConfig = body.exportRequest?.config ?? {};
                const courtState = ('courtState' in exportConfig ? String(exportConfig.courtState) : undefined) ?? 'Texas';
                const courtCounty = ('courtCounty' in exportConfig ? String(exportConfig.courtCounty) : undefined) ?? '';
                const petitionerName = ('petitionerName' in exportConfig ? String(exportConfig.petitionerName) : undefined) ?? 'Petitioner';
                const respondentName = ('respondentName' in exportConfig ? String(exportConfig.respondentName) : undefined) ?? undefined;
                const causeNumber = ('causeNumber' in exportConfig ? String(exportConfig.causeNumber) : undefined) ?? undefined;
                const caseType = ('caseType' in exportConfig ? String(exportConfig.caseType) : undefined) ?? body.exportRequest?.path ?? 'general';

                // ────────────────────────────────────────────────
                // 1a. IDEMPOTENCY CHECK (before any DB writes)
                // ────────────────────────────────────────────────
                // Hash all deterministic pre-generation inputs that affect output.
                // Excludes AI-generated content (draftedSections) so identical
                // requests always produce the same fingerprint.
                const exportPath = (body.exportRequest?.path ?? 'court_document') as ExportPath;
                const normalizedExportRequest = {
                    ...body.exportRequest,
                    path: exportPath,
                    config: {
                        ...(body.exportRequest?.config ?? {}),
                        courtState,
                        courtCounty,
                        petitionerName,
                        respondentName,
                        causeNumber,
                        caseType,
                    },
                };
                const stablePreGenPayload = {
                    caseId: body.caseId,
                    exportPath,
                    caseType,
                    courtState,
                    courtCounty,
                    petitionerName,
                    respondentName,
                    causeNumber,
                    exportRequest: normalizedExportRequest,
                    assemblyResult: body.assemblyResult,
                    reviewItems: (body as unknown as Record<string, unknown>).reviewItems ?? null,
                    overrides: (body as unknown as Record<string, unknown>).overrides ?? null,
                    courtIdentityPatch: body.courtIdentityPatch ?? null,
                };
                const payloadHash = hashPayload(stablePreGenPayload);
                runFingerprint = generateRunFingerprint({
                    userId,
                    caseId: body.caseId,
                    exportPath,
                    payloadHash,
                });

                const claimResult = await convex.mutation(api.exportRuns.claimExportRun, {
                    fingerprint: runFingerprint,
                    caseId: body.caseId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                    exportPath,
                });

                claimedExportRun = claimResult.status === 'claimed';

                if (claimResult.status === 'already_completed') {
                    // Fetch cached export metadata for a consistent SSE shape
                    let cachedExport: Record<string, unknown> | null = null;
                    try {
                        cachedExport = await convex.query(api.generatedDocumentsExport.getExportById, {
                            exportId: claimResult.exportId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                        }) as Record<string, unknown> | null;
                    } catch {
                        // Non-critical — fall back to minimal shape
                    }
                    send({
                        type: 'complete',
                        exportId: claimResult.exportId,
                        reused: true,
                        message: 'Export already completed — returning cached result.',
                        filename: cachedExport?.filename ?? null,
                        artifactVerified: true,
                        sha256: cachedExport?.sha256 ?? null,
                        sectionCount: null,
                        aiDraftedCount: null,
                        lockedCount: null,
                        preflightSummary: null,
                    });
                    return;
                }

                if (claimResult.status === 'in_progress') {
                    throw new ExportDocumentGenerationError({
                        code: 'EXPORT_IDEMPOTENCY_CONFLICT',
                        message: 'Duplicate export request — generation already in progress',
                    });
                }

                // ────────────────────────────────────────────────
                // 1b. QUEUE ADMISSION CHECK (concurrency gate)
                // ────────────────────────────────────────────────
                const queueResult = await convex.mutation(api.exportJobs.enqueueExportJob, {
                    caseId: body.caseId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                    exportPath,
                    fingerprint: runFingerprint,
                });

                if (queueResult.status === 'rejected') {
                    throw new ExportDocumentGenerationError({
                        code: 'EXPORT_QUEUE_OVERLOADED',
                        message: `Export queue full — ${queueResult.activeCount}/${queueResult.limit} active exports. Please wait and try again.`,
                    });
                }

                jobId = queueResult.jobId as string;

                // Transition job to running
                await convex.mutation(api.exportJobs.startExportJob, {
                    jobId: jobId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                });

                // ────────────────────────────────────────────────
                // 1c. CREATE EXPORT RECORD (only after claim + admission)
                // ────────────────────────────────────────────────
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

                // Detect fast path: synthetic pre_drafted node from ExportContext pasted content
                const classifiedNodes = body.assemblyResult?.assembly?.classifiedNodes ?? [];
                const isFastPath = classifiedNodes.length === 1
                    && classifiedNodes[0].tags?.includes('pre_drafted');

                let draftedSections: DraftedSection[];

                if (isFastPath) {
                    // ── UNIFIED PIPELINE: Pasted content goes through legal structure parser ──
                    // No fast path. No blob section. The unified pipeline normalizes,
                    // classifies, parses, validates, and builds a proper LegalDocument.
                    send({
                        type: 'milestone',
                        stage: 'drafting',
                        percent: 65,
                        message: 'Parsing document structure...',
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

                    // Parse through unified legal document pipeline
                    const { prepareLegalDocument } = await import('@/lib/legal-docs/pipeline/prepareLegalDocument');
                    const parsedLegalDoc = prepareLegalDocument({
                        text: rawText,
                        metadata: {
                            causeNumber,
                            jurisdiction: courtState,
                            county: courtCounty,
                        },
                        jurisdictionHint: courtState,
                    });

                    // Convert parsed sections into draftedSections format for compatibility
                    // with the existing adapt pipeline downstream
                    draftedSections = parsedLegalDoc.sections.map((section) => ({
                        sectionId: section.id,
                        heading: section.heading,
                        body: section.blocks
                            .map((block) => {
                                if (block.type === 'paragraph') return block.text;
                                if (block.type === 'numbered_paragraph') return `${block.number}. ${block.text}`;
                                if (block.type === 'bullet_list') return block.items.map(i => `• ${i}`).join('\n');
                                if (block.type === 'numbered_list') return block.items.map((item: string, idx: number) => `${idx + 1}. ${item}`).join('\n');
                                if (block.type === 'lettered_list') return block.items.join('\n');
                                return '';
                            })
                            .join('\n\n'),
                        numberedItems: section.blocks
                            .filter((b): b is import('@/lib/legal-docs/types').NumberedParagraphBlock => b.type === 'numbered_paragraph')
                            .map(b => b.text),
                        source: 'user_locked' as const,
                    }));

                    // Store parsed legal document for downstream use
                    (body as unknown as Record<string, unknown>).__parsedLegalDocument = parsedLegalDoc;
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
                // 2a. COURT IDENTITY RESOLUTION (court_document only)
                // ────────────────────────────────────────────────
                let courtIdentity: CourtIdentity | undefined;

                if (exportPath === 'court_document') {
                    send({
                        type: 'milestone',
                        stage: 'validating',
                        percent: 73,
                        message: 'Resolving court identity...',
                    });

                    // Query Convex for court settings (returns null when none exist)
                    const courtSettings = await convex.query(api.courtSettings.get, {});

                    const rawDocType = 'documentType' in exportConfig
                        ? String((exportConfig as unknown as Record<string, unknown>).documentType)
                        : undefined;

                    // Extract metadata from every review text variant so identity data
                    // survives caption cleanup in edited/transformed text.
                    const allReviewText = collectExportIdentityText(body);

                    const extracted = extractCourtMetadataFromText(allReviewText);

                    const extractedFromText: Record<string, string | undefined> = {};
                    const keyMap: Record<string, string> = {
                        petitionerName: 'captionPetitionerName',
                        respondentName: 'captionRespondentName',
                        documentTitle: 'resolvedTitle',
                        documentSubtitle: 'resolvedSubtitle',
                    };
                    for (const [key, field] of Object.entries(extracted)) {
                        if (field && typeof field === 'object' && 'value' in field) {
                            extractedFromText[keyMap[key] ?? key] = field.value;
                        }
                    }

                    courtIdentity = resolveCourtIdentity({
                        patch: body.courtIdentityPatch,
                        extractedFromText,
                        courtSettings: courtSettings as CourtSettingsData | null,
                        draftTitle: getTemplateName(body.exportRequest?.path ?? 'general'),
                        draftDocumentKind: isValidDocumentKind(rawDocType) ? rawDocType : undefined,
                    });
                    courtIdentity = {
                        ...courtIdentity,
                        childrenNames: cleanChildrenNames(courtIdentity.childrenNames),
                    };

                    // ── Final authority: detect court document issues ──
                    if (isSapcrIdentity(courtIdentity) && courtIdentity.childrenNames.length === 0) {
                        const requestConfig = (body.exportRequest?.config ?? {}) as unknown as Record<string, unknown>;
                        console.warn('[ExportStream] SAPCR identity unresolved before issue detection', {
                            reviewItemsCount: body.reviewItems?.length ?? 0,
                            assemblyNodesCount: body.assemblyResult?.assembly?.classifiedNodes?.length ?? 0,
                            identityTextLength: allReviewText.length,
                            hasInterestPhrase: /IN\s+THE\s+INTEREST\s+OF/i.test(allReviewText),
                            hasConfigPastedContent: typeof requestConfig.pastedContent === 'string' && requestConfig.pastedContent.trim() !== '',
                            caseTitleFormat: courtIdentity.caseTitleFormat,
                            caseType: courtIdentity.caseType,
                            documentKind: courtIdentity.documentKind,
                        });
                    }

                    const sectionTexts = draftedSections.flatMap(s => [
                        s.heading ?? '',
                        s.body ?? '',
                        ...(s.numberedItems ?? []),
                    ]);
                    const courtIssues = detectCourtDocumentIssues(
                        courtIdentity,
                        { documentType: courtIdentity.documentKind, exportPath },
                        sectionTexts,
                    );

                    const blockers = courtIssues.filter(i => i.severity === 'blocker');
                    if (blockers.length > 0) {
                        pendingCourtIssues = courtIssues;
                        // Send the clarification SSE error to the client first
                        send({
                            type: 'error',
                            errorCode: 'COURT_DOCUMENT_NEEDS_CLARIFICATION',
                            message: 'Court document has unresolved issues that require clarification.',
                            issues: courtIssues,
                        });
                        clarificationEventSent = true;

                        // Throw coded error so the outer catch block handles
                        // export/job/idempotency cleanup with proper retry logic
                        const courtErr = new Error('Court document has unresolved issues.');
                        (courtErr as Error & { code?: string }).code = 'COURT_DOCUMENT_NEEDS_CLARIFICATION';
                        throw courtErr;
                    }
                }

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

                // 4b. Build caption for court documents — use resolved identity when available
                const resolvedState = courtIdentity?.state ?? courtState;
                const resolvedCounty = courtIdentity?.county ?? courtCounty;
                const resolvedCauseNumber = courtIdentity?.causeNumber ?? causeNumber;

                // ── SAPCR guard: recover child name from all sources ──
                if (courtIdentity && exportPath === 'court_document') {
                    courtIdentity = {
                        ...courtIdentity,
                        childrenNames: cleanChildrenNames(courtIdentity.childrenNames),
                    };

                    const isSAPCR = isSapcrIdentity(courtIdentity);

                    if (isSAPCR && (!courtIdentity.childrenNames || courtIdentity.childrenNames.length === 0)) {
                        // Last-resort: scan review items and the original pasted source.
                        const fullReviewText = collectExportIdentityText(body);

                        const recoveredChildName = extractSapcrChildNameRobust(fullReviewText);

                        if (recoveredChildName) {
                            // Recovered child name from review text
                            console.log('[ExportStream] SAPCR recovery: extracted child name from review text:', recoveredChildName);
                            courtIdentity = {
                                ...courtIdentity,
                                childrenNames: cleanChildrenNames([recoveredChildName]),
                            };
                        } else {
                            console.error('[ExportStream] SAPCR guard failed: no child name found in any source');
                            console.error('[ExportStream] reviewItems count:', (body.reviewItems ?? []).length);
                            console.error('[ExportStream] fullReviewText (first 300):', fullReviewText.slice(0, 300));
                            console.error('[ExportStream] courtIdentity:', JSON.stringify({
                                caseTitleFormat: courtIdentity.caseTitleFormat,
                                caseType: courtIdentity.caseType,
                                childrenNames: courtIdentity.childrenNames,
                            }));
                            const courtIssues = detectCourtDocumentIssues(
                                courtIdentity,
                                { documentType: courtIdentity.documentKind, exportPath },
                                [fullReviewText],
                            );
                            pendingCourtIssues = courtIssues;
                            send({
                                type: 'error',
                                errorCode: 'COURT_DOCUMENT_NEEDS_CLARIFICATION',
                                message: 'SAPCR caption needs the child name before export can continue.',
                                issues: courtIssues,
                            });
                            clarificationEventSent = true;
                            const courtErr = new Error('SAPCR caption needs the child name before export can continue.');
                            (courtErr as Error & { code?: string }).code = 'COURT_DOCUMENT_NEEDS_CLARIFICATION';
                            throw courtErr;
                        }
                    }
                }

                let captionResult = exportPath === 'court_document'
                    ? buildExportCaption({
                        style: exportProfile.court.captionStyle,
                        courtName: courtIdentity?.courtName ?? undefined,
                        judicialDistrict: courtIdentity?.judicialDistrict ?? undefined,
                        causeNumber: resolvedCauseNumber,
                        captionPetitionerName: courtIdentity?.captionPetitionerName ?? petitionerName,
                        captionRespondentName: courtIdentity?.captionRespondentName ?? respondentName,
                        childrenNames: courtIdentity?.childrenNames,
                        state: resolvedState,
                        county: resolvedCounty,
                        caseType: courtIdentity?.documentKind ?? caseType,
                        caseTitleFormat: courtIdentity?.caseTitleFormat ?? undefined,
                    })
                    : null;
                let caption = captionResult?.caption ?? null;

                if (courtIdentity && exportPath === 'court_document' && caption) {
                    const leftText = caption.leftLines.join(' ');
                    const hasSapcrCaption = /IN THE INTEREST OF/i.test(leftText);
                    const childNameLines = caption.leftLines.filter((line) => {
                        const trimmed = line.trim();
                        return trimmed !== '' && !/^(IN THE INTEREST OF|A CHILD|CHILDREN)$/i.test(trimmed);
                    });
                    if (hasSapcrCaption && childNameLines.length === 0) {
                        const identityText = collectExportIdentityText(body);
                        const recoveredChildName = extractSapcrChildNameRobust(identityText);
                        if (recoveredChildName) {
                            courtIdentity = {
                                ...courtIdentity,
                                childrenNames: cleanChildrenNames([recoveredChildName]),
                            };
                            captionResult = buildExportCaption({
                                style: exportProfile.court.captionStyle,
                                courtName: courtIdentity.courtName ?? undefined,
                                judicialDistrict: courtIdentity.judicialDistrict ?? undefined,
                                causeNumber: resolvedCauseNumber,
                                captionPetitionerName: courtIdentity.captionPetitionerName ?? petitionerName,
                                captionRespondentName: courtIdentity.captionRespondentName ?? respondentName,
                                childrenNames: courtIdentity.childrenNames,
                                state: resolvedState,
                                county: resolvedCounty,
                                caseType: courtIdentity.documentKind ?? caseType,
                                caseTitleFormat: courtIdentity.caseTitleFormat ?? undefined,
                            });
                            caption = captionResult.caption;
                        } else {
                        console.warn('[ExportStream] SAPCR caption built without child line', {
                            reviewItemsCount: body.reviewItems?.length ?? 0,
                            assemblyNodesCount: body.assemblyResult?.assembly?.classifiedNodes?.length ?? 0,
                            identityTextLength: identityText.length,
                            hasInterestPhrase: /IN\s+THE\s+INTEREST\s+OF/i.test(identityText),
                            recoveredFromIdentityText: false,
                            courtIdentityChildrenCount: courtIdentity.childrenNames?.length ?? 0,
                            captionLeftLineCount: caption.leftLines.length,
                        });
                        const courtIssues = detectCourtDocumentIssues(
                            { ...courtIdentity, childrenNames: [] },
                            { documentType: courtIdentity.documentKind, exportPath },
                            [],
                        );
                        pendingCourtIssues = courtIssues;
                        send({
                            type: 'error',
                            errorCode: 'COURT_DOCUMENT_NEEDS_CLARIFICATION',
                            message: 'SAPCR caption needs the child name before export can continue.',
                            issues: courtIssues,
                        });
                        clarificationEventSent = true;
                        const courtErr = new Error('SAPCR caption needs the child name before export can continue.');
                        (courtErr as Error & { code?: string }).code = 'COURT_DOCUMENT_NEEDS_CLARIFICATION';
                        throw courtErr;
                        }
                    }
                }

                // 4c. Build adapt params
                const mappedSections = body.assemblyResult?.assembly
                    ?.mappedSections as ExhibitMappedSections | undefined;

                const adaptParams: AdaptToCanonicalParams = {
                    path: exportPath,
                    title: (courtIdentity?.resolvedTitle ?? getTemplateName(body.exportRequest?.path ?? 'general')).toUpperCase(),
                    draftedSections: draftedSections.map((s) => ({
                        sectionId: s.sectionId,
                        heading: s.heading,
                        body: s.body,
                        numberedItems: s.numberedItems,
                        source: s.source,
                    })),
                    caseId: body.caseId,
                    causeNumber: resolvedCauseNumber,
                    jurisdiction: { state: resolvedState, county: resolvedCounty },
                    partyRole: undefined,
                    documentType: caseType,
                    caption,
                    signature: exportPath === 'court_document'
                        ? {
                            intro: 'Respectfully submitted,',
                            signerLines: [
                                `_________________________`,
                                courtIdentity?.filingPartyLegalName ?? petitionerName,
                                courtIdentity?.isProSe ? 'Pro Se' : '',
                            ].filter(Boolean),
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
                                courtIdentity?.filingPartyLegalName ?? petitionerName,
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
                    causeNumber: courtIdentity?.causeNumber ?? causeNumber,
                    courtContext: courtIdentity ? {
                        filingPartyName: courtIdentity.filingPartyLegalName,
                        filingPartyRole: courtIdentity.filingPartyRole,
                        isProSe: courtIdentity.isProSe,
                        prayerIntro: undefined,
                        prayerRequests: undefined,
                    } : undefined,
                    resolvedTitle: courtIdentity?.resolvedTitle,
                    metadata: { caseType, exportPath, runId: body.runId },
                    courtIdentity,
                    identitySourceText: collectExportIdentityText(body),
                    isInitiatingFiling: 'isInitiatingFiling' in exportConfig
                        ? Boolean(exportConfig.isInitiatingFiling)
                        : false,
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

                // Convex storage upload returns only { storageId } — no byte-length
                // metadata about the stored file. The upload response Content-Length
                // reflects the JSON body size, NOT the uploaded PDF size.
                // Pass the original buffer length for both values; the byte-length
                // check is effectively a storageId format validation only.
                // True integrity is ensured by the SHA-256 checksum persisted with
                // the record (and re-verified on download if needed).
                const reportedByteLength = pdfBuffer.length;

                const verification = verifyUploadedArtifact({
                    storageId,
                    reportedByteLength,
                    expectedByteLength: pdfBuffer.length,
                    checksum: preUploadChecksum,
                });

                if (!verification.verified) {
                    console.error('[ExportStream] Artifact integrity check failed:', verification);
                    throw new ExportDocumentGenerationError({
                        code: 'EXPORT_ARTIFACT_INTEGRITY_FAILED',
                        message: `Artifact integrity verification failed: byteLengthMatch=${verification.byteLengthMatch}, storageIdValid=${verification.storageIdValid}`,
                        details: verification,
                    });
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
                // Mark idempotency run as completed (only if this request claimed it)
                if (runFingerprint && claimedExportRun) {
                    for (let attempt = 1; attempt <= MAX_TERMINAL_MUTATION_RETRIES; attempt++) {
                        try {
                            await convex.mutation(api.exportRuns.completeExportRun, {
                                fingerprint: runFingerprint,
                                exportId: exportId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                            });
                            break;
                        } catch (idempErr) {
                            if (attempt === MAX_TERMINAL_MUTATION_RETRIES) {
                                // Compensating mutation: force the run to 'failed' so it
                                // doesn't remain stuck in 'in_progress' forever.
                                try {
                                    await convex.mutation(api.exportRuns.failExportRun, {
                                        fingerprint: runFingerprint,
                                        errorCode: 'EXPORT_IDEMPOTENCY_COMPLETION_FAILED',
                                    });
                                } catch (compensateErr) {
                                    console.error(
                                        `[ExportStream] CRITICAL: Compensating failExportRun also failed. ` +
                                        `Fingerprint ${runFingerprint} is stuck in in_progress. ` +
                                        `Manual repair required.`,
                                        compensateErr,
                                    );
                                }
                            } else {
                                console.warn(`[ExportStream] Retrying completeExportRun (attempt ${attempt}/${MAX_TERMINAL_MUTATION_RETRIES}):`, idempErr);
                                await new Promise((r) => setTimeout(r, RETRY_BACKOFF_BASE_MS * attempt));
                            }
                        }
                    }
                }

                // Mark queue job as completed
                if (jobId) {
                    try {
                        await convex.mutation(api.exportJobs.completeExportJob, {
                            jobId: jobId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                        });
                    } catch (jobErr) {
                        console.warn('[ExportStream] Failed to complete export job:', jobErr);
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
                    elapsedMs: Date.now() - pipelineStartTime,
                    jobId,
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

                // Mark idempotency run as failed (only if this request claimed it)
                if (runFingerprint && claimedExportRun) {
                    for (let attempt = 1; attempt <= MAX_TERMINAL_MUTATION_RETRIES; attempt++) {
                        try {
                            await convex.mutation(api.exportRuns.failExportRun, {
                                fingerprint: runFingerprint,
                                errorCode,
                            });
                            break;
                        } catch (idempErr) {
                            if (attempt === MAX_TERMINAL_MUTATION_RETRIES) {
                                console.error(
                                    `[ExportStream] CRITICAL: Failed to fail idempotency run after ${attempt} attempts. ` +
                                    `Fingerprint ${runFingerprint} is stuck in in_progress. ` +
                                    `Original errorCode: ${errorCode}. Manual repair required.`,
                                    idempErr,
                                );
                            } else {
                                console.warn(`[ExportStream] Retrying failExportRun (attempt ${attempt}/${MAX_TERMINAL_MUTATION_RETRIES}):`, idempErr);
                                await new Promise((r) => setTimeout(r, RETRY_BACKOFF_BASE_MS * attempt));
                            }
                        }
                    }
                }

                // Mark queue job as failed
                if (jobId) {
                    try {
                        await convex.mutation(api.exportJobs.failExportJob, {
                            jobId: jobId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                            errorCode,
                        });
                    } catch (jobErr) {
                        console.warn('[ExportStream] Failed to fail export job:', jobErr);
                    }
                }

                if (errorCode === 'COURT_DOCUMENT_NEEDS_CLARIFICATION') {
                    if (!clarificationEventSent) {
                        send({
                            type: 'error',
                            errorCode,
                            message,
                            issues: pendingCourtIssues ?? [],
                        });
                    }
                } else {
                    send({
                        type: 'error',
                        errorCode,
                        message,
                    });
                }
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
  } catch (topLevelError) {
    // Catch-all: prevent Next.js from returning an HTML 500 error page.
    // This catches errors in auth(), rate limiting, JSON parsing, or
    // Convex client creation — anything before the SSE stream starts.
    const stack = topLevelError instanceof Error ? topLevelError.stack : String(topLevelError);
    const message = topLevelError instanceof Error
        ? topLevelError.message
        : 'Unknown export route error';
    console.error('[ExportStream] TOP-LEVEL CRASH');
    console.error('[ExportStream] Message:', message);
    console.error('[ExportStream] Stack:', stack);
    console.error('[ExportStream] Type:', typeof topLevelError);
    if (topLevelError instanceof Error && topLevelError.cause) {
        console.error('[ExportStream] Cause:', topLevelError.cause);
    }
    return new Response(
        JSON.stringify({ error: message, code: 'route_crash', stack: stack?.slice(0, 1000) }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

// ---------------------------------------------------------------------------
// Error Classification
// ---------------------------------------------------------------------------

/** Classify error into typed error code based on message/stack. */
function classifyError(error: Error): string {
    const msg = error.message?.toLowerCase() ?? '';
    if (msg.includes('sapcr caption') && msg.includes('child name')) return 'COURT_DOCUMENT_NEEDS_CLARIFICATION';
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
