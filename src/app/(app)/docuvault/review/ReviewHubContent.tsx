'use client';

/**
 * Review Hub Content — The product center of the export pipeline.
 *
 * Multi-phase client component:
 * - reviewing: Canvas + sidebar + preflight inspection
 * - drafting:  Step checklist showing pipeline progress
 * - completed: Success card with Download + View in DocuVault + stats
 * - error:     Error message with retry
 *
 * The user approves the assembly output here before GPT drafting begins.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft,
    Lightning,
    Export,
    CheckCircle,
    Download,
    ArrowSquareOut,
    ArrowClockwise,
    SpinnerGap,
    Circle,
    XCircle,
} from '@phosphor-icons/react';
import { useExport, type DraftingStage } from '../context/ExportContext';
import { useDraftingStream, type DraftStreamInput } from '@/hooks/useDraftingStream';
import { runPreflightChecks } from '@/lib/export-assembly/validation/preflightValidator';
import MappingCanvas from '@/components/review/MappingCanvas';
import RevisionModal from '@/components/review/RevisionModal';
// DraftStyleToggle removed in Review Hub redesign (Phase 1)
import ClarificationModal from '@/components/review/ClarificationModal';
import type { MappingReviewItem } from '@/lib/export-assembly/types/exports';
import { detectCourtDocumentIssues, ISSUE_TO_MODE, MODE_PRIORITY, type ClarificationModalMode } from '@/lib/exports/courtDocumentIssues';
import { resolveCourtIdentity, type CourtSettingsData, type NexProfileData, type UserProfileData, type CourtIdentity } from '@/lib/exports/resolveCourtIdentity';
import { storeCourtHandoff } from '@/lib/exports/courtHandoff';
import { extractCourtMetadataFromText } from '@/lib/exports/extractCourtMetadataFromText';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map an export path value to its human-readable display label. */
function getExportLabel(exportPath: string | null | undefined): string {
    switch (exportPath) {
        case 'court_document': return 'Court Document';
        case 'case_summary': return 'Case Summary';
        case 'exhibit_packet': return 'Exhibit Packet';
        default: return 'Export';
    }
}

/** Drafting checklist stages in order. */
const DRAFTING_STAGES: { key: DraftingStage; label: string }[] = [
    { key: 'drafting', label: 'Drafting AI sections' },
    { key: 'preflight', label: 'Running preflight checks' },
    { key: 'rendering_html', label: 'Rendering document' },
    { key: 'rendering_pdf', label: 'Generating PDF' },
    { key: 'saving', label: 'Saving to DocuVault' },
];

/** Map error codes to user-friendly descriptions for the error phase. */
function getErrorDescription(code: string | null): string {
    switch (code) {
        case 'client_aborted': return 'Export was canceled before completion.';
        case 'draft_failed': return 'AI drafting failed. The AI model may be unavailable.';
        case 'preflight_failed': return 'Preflight validation encountered an error.';
        case 'render_html_failed': return 'Document HTML rendering failed.';
        case 'render_pdf_failed': return 'PDF generation failed. Chrome may be unavailable.';
        case 'upload_failed': return 'Failed to upload PDF to storage.';
        case 'save_failed': return 'Failed to save export record.';
        default: return 'An unexpected error occurred during export.';
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the full text array for court-issue detection (review items + resolved boilerplate). */
function buildCourtIssueTexts(
    items: { originalText: string }[],
    courtResolvedText?: string | null,
): string[] {
    const texts = items.map(item => item.originalText);
    if (courtResolvedText) {
        texts.push(courtResolvedText);
    }
    return texts;
}

/** Collect identity-bearing text from the current review state for final export recovery. */
function buildCourtIdentitySourceText(
    exportRequest: unknown,
    assemblyResult: unknown,
    items: MappingReviewItem[],
    courtResolvedText?: string | null,
): string {
    const requestConfig = ((exportRequest as { config?: Record<string, unknown> } | null)?.config ?? {});
    const requestText = [
        requestConfig.pastedContent,
        requestConfig.rawDocumentText,
        requestConfig.documentText,
        requestConfig.sourceText,
    ];
    const classifiedNodes =
        (assemblyResult as {
            assembly?: {
                classifiedNodes?: Array<{
                    rawText?: string;
                    cleanedText?: string;
                    transformedText?: { courtSafe?: string };
                }>;
            };
        } | null)?.assembly?.classifiedNodes ?? [];
    const nodeText = classifiedNodes.flatMap((node) => [
        node.rawText,
        node.cleanedText,
        node.transformedText?.courtSafe,
    ]);
    const itemText = items.flatMap((item) => [
        item.userOverride?.editedText,
        item.transformedCourtSafeText,
        item.originalText,
    ]);

    return [
        ...requestText,
        ...nodeText,
        ...itemText,
        courtResolvedText,
    ].filter((value): value is string => typeof value === 'string' && value.trim() !== '')
        .join('\n');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Client-side Review Hub content (requires ExportProvider context). */
export default function ReviewHubContent() {
    const {
        state,
        dispatch,
        lockSection,
        editItem,
        moveItem,
        excludeItem,
        setPreflight,
        startDrafting,
        reset,
    } = useExport();

    const router = useRouter();
    const { startStream, abort } = useDraftingStream({ dispatch });

    // Local UI state
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [revisingItemId, setRevisingItemId] = useState<string | null>(null);
    const [isDrafting, setIsDrafting] = useState(false);
    const [showPreflight, setShowPreflight] = useState(false);

    // Court document: compute whether export is allowed
    const isCourtDocument = state.exportPath === 'court_document';
    const courtBlockers = useMemo(() => {
        if (!isCourtDocument) return [];
        return state.courtIssues.filter(i => i.severity === 'blocker');
    }, [isCourtDocument, state.courtIssues]);
    const canExportCourtDocument = !isCourtDocument || courtBlockers.length === 0;

    // Court settings save mutation
    const upsertCourtSettings = useMutation(api.courtSettings.upsert);

    // Determine active court modal mode from highest-priority blocker
    const courtMode: ClarificationModalMode | undefined = useMemo(() => {
        if (!isCourtDocument) return undefined;
        const blockerModes = new Set(
            state.courtIssues
                .filter(i => i.severity === 'blocker')
                .map(i => ISSUE_TO_MODE[i.id]),
        );
        return MODE_PRIORITY.find(m => blockerModes.has(m));
    }, [isCourtDocument, state.courtIssues]);


    // UI redesign shell states
    const [showClarificationModal, setShowClarificationModal] = useState(false);
    
    // Show the clarification modal if there are unclassified items
    const clarificationShownRef = useRef(false);
    useEffect(() => {
        if (state.phase === 'reviewing' && state.reviewItems.length > 0 && !clarificationShownRef.current) {
            const hasUnclassified = state.reviewItems.some(item =>
                item.suggestedSections.length === 0
                || item.suggestedSections.some(s => s.toLowerCase() === 'unclassified')
            );
            if (hasUnclassified) {
                clarificationShownRef.current = true;
                setShowClarificationModal(true);
            }
        }
    }, [state.phase, state.reviewItems]);

    // Query court settings and nex profile for full identity resolution
    const rawCourtSettings = useQuery(api.courtSettings.get);
    const rawNexProfile = useQuery(api.nexProfiles.getByUser);

    // Map Convex objects to the shapes expected by resolveCourtIdentity
    const courtSettingsData: CourtSettingsData | undefined = rawCourtSettings
        ? {
            state: rawCourtSettings.state,
            county: rawCourtSettings.county,
            courtName: rawCourtSettings.courtName,
            causeNumber: rawCourtSettings.causeNumber,
            assignedJudge: rawCourtSettings.assignedJudge,
            petitionerLegalName: rawCourtSettings.petitionerLegalName,
            respondentLegalName: rawCourtSettings.respondentLegalName,
            children: rawCourtSettings.children,
            judicialDistrict: rawCourtSettings.judicialDistrict,
            caseTitleFormat: rawCourtSettings.caseTitleFormat,
            caseTitleCustom: rawCourtSettings.caseTitleCustom,
            userRole: rawCourtSettings.petitionerRole,
            userLegalName: rawCourtSettings.petitionerLegalName,
        }
        : undefined;

    // nexProfile is the opposing party — safe for opposingPartyName/Role only
    const nexProfileData: NexProfileData | undefined = rawNexProfile
        ? { fullName: rawNexProfile.legalName }
        : undefined;

    // User's own profile (Level 3 in priority chain)
    const rawUserProfile = useQuery(api.users.me);
    const userProfileData: UserProfileData | undefined = rawUserProfile
        ? {
            fullName: rawUserProfile.name,
            state: rawUserProfile.state ?? undefined,
            county: rawUserProfile.county ?? undefined,
            hasAttorney: rawUserProfile.hasAttorney ?? undefined,
        }
        : undefined;

    // Level 1: Extract court metadata from pasted document text
    const extractedFromText = useMemo(() => {
        if (!isCourtDocument || state.reviewItems.length === 0) return undefined;
        const allText = state.reviewItems.map(i => i.originalText).join('\n');
        const extracted = extractCourtMetadataFromText(allText);
        // Flatten to Record<string, string | undefined> for resolveField (.value only)
        const flat: Record<string, string | undefined> = {};
        // Map extracted field names to resolver-expected keys
        const keyMap: Record<string, string> = {
            petitionerName: 'captionPetitionerName',
            respondentName: 'captionRespondentName',
            documentTitle: 'resolvedTitle',
            documentSubtitle: 'resolvedSubtitle',
        };
        for (const [key, field] of Object.entries(extracted)) {
            if (field && typeof field === 'object' && 'value' in field) {
                const resolverKey = keyMap[key] ?? key;
                flat[resolverKey] = field.value;
            }
        }
        return flat;
    }, [isCourtDocument, state.reviewItems]);

    // Resolved identity for modal auto-fill
    const resolvedIdentity = useMemo((): CourtIdentity | undefined => {
        if (!isCourtDocument) return undefined;
        return resolveCourtIdentity({
            patch: state.courtIdentityPatch ?? undefined,
            extractedFromText,
            courtSettings: courtSettingsData,
            userProfile: userProfileData,
            nexProfile: nexProfileData,
        });
    }, [isCourtDocument, extractedFromText, state.courtIdentityPatch, courtSettingsData, userProfileData, nexProfileData]);

    // Detect court document issues on review phase entry and re-check when patch changes
    useEffect(() => {
        if (state.phase !== 'reviewing' || !isCourtDocument) return;
        // Full source set: merge patch with courtSettings and nexProfile so the
        // client-side gate matches the backend resolution in route.ts.
        const identity = resolveCourtIdentity({
            patch: state.courtIdentityPatch ?? undefined,
            extractedFromText,
            courtSettings: courtSettingsData,
            userProfile: userProfileData,
            nexProfile: nexProfileData,
        });
        const itemTexts = buildCourtIssueTexts(state.reviewItems, state.courtResolvedText);
        const issues = detectCourtDocumentIssues(
            identity,
            { documentType: identity.documentKind, exportPath: 'court_document' },
            itemTexts,
        );
        dispatch({ type: 'SET_COURT_ISSUES', issues });
    }, [state.phase, isCourtDocument, state.courtIdentityPatch, state.courtResolvedText, state.reviewItems, extractedFromText, courtSettingsData, userProfileData, nexProfileData, dispatch]);

    // Track sidebar edit state to auto-save on selection change
    const pendingEditRef = useRef<{ nodeId: string; text: string } | null>(null);
    // Synchronous guard — prevents double-submission before React re-renders
    const draftingGuardRef = useRef(false);
    // Preserve failed exportId for retry linkage
    const retryExportIdRef = useRef<string | null>(null);

    // Cleanup: abort stream on unmount
    useEffect(() => {
        return () => { abort(); };
    }, [abort]);

    // Merge item overrides into review items so grouping/stats reflect edits
    const effectiveItems = useMemo(() => {
        const overridesByNodeId = new Map(
            state.overrides.itemOverrides.map(ov => [ov.nodeId, ov]),
        );
        return state.reviewItems.map(item => {
            const ov = overridesByNodeId.get(item.nodeId);
            if (!ov) return item;
            return {
                ...item,
                userOverride: {
                    ...item.userOverride,
                    editedText: ov.editedText ?? item.userOverride?.editedText,
                    exclude: ov.excluded ?? item.userOverride?.exclude,
                    forceSection: ov.forcedSection ?? item.userOverride?.forceSection,
                },
            };
        });
    }, [state.reviewItems, state.overrides.itemOverrides]);

    // Group review items by their suggested section (first suggestion)
    const sectionGroups = useMemo(() => {
        const groups = new Map<string, MappingReviewItem[]>();
        for (const item of effectiveItems) {
            const section = item.userOverride?.forceSection
                ?? item.suggestedSections[0]
                ?? 'Unclassified';
            const list = groups.get(section) ?? [];
            list.push(item);
            groups.set(section, list);
        }
        return groups;
    }, [effectiveItems]);

    // Compute stats (memoized to avoid redundant filtering)
    const { totalItems, includedItems, lockedSections, sectionCount } = useMemo(() => {
        // Respect explicit reviewer overrides (re-include or exclude)
        const isExcluded = (i: MappingReviewItem) =>
            i.userOverride?.exclude ?? !i.includedInExport;

        const total = effectiveItems.length;
        const included = effectiveItems.filter(i => !isExcluded(i)).length;
        const locked = state.overrides.sectionOverrides.filter(s => s.isLocked).length;
        return {
            totalItems: total,
            includedItems: included,
            lockedSections: locked,
            sectionCount: sectionGroups.size,
        };
    }, [effectiveItems, state.overrides.sectionOverrides, sectionGroups.size]);

    // Find selected item
    const selectedItem = useMemo(
        () => effectiveItems.find(i => i.nodeId === selectedItemId) ?? null,
        [effectiveItems, selectedItemId],
    );

    /** Whether the current assembly is a fast-path (pre-drafted pasted content). */
    const isFastPath = useMemo(() => {
        const nodes = state.assemblyResult?.assembly?.classifiedNodes ?? [];
        return nodes.length === 1 && nodes[0].tags?.includes('pre_drafted');
    }, [state.assemblyResult]);

    /** Run manual preflight checks. */
    const handleRunPreflight = useCallback(() => {
        try {
            const result = runPreflightChecks({
                exportPath: state.exportPath ?? 'court_document',
                config: (state.exportRequest?.config ?? {}) as Record<string, unknown>,
                reviewItems: effectiveItems,
                overrides: state.overrides,
                isFastPath,
            });
            setPreflight(result);
            setShowPreflight(true);
        } catch (err) {
            console.error('[ReviewHub] Preflight failed:', err);
            // Surface the error to the user via a synthetic preflight result
            setPreflight({
                checks: [{
                    id: 'preflight_error',
                    label: 'Preflight check failed',
                    severity: 'error' as const,
                    detail: err instanceof Error ? err.message : 'An unexpected error occurred during preflight validation.',
                    category: 'compliance',
                }],
                criticalCount: 0,
                errorCount: 1,
                warningCount: 0,
                readinessScore: 0,
                canProceed: false,
            });
            setShowPreflight(true);
        }
    }, [state.exportPath, state.exportRequest, effectiveItems, state.overrides, setPreflight, isFastPath]);

    /** Flush any pending sidebar edit + start GPT drafting (synchronous guard). */
    const handleApproveAndDraft = useCallback(() => {
        if (draftingGuardRef.current) return;

        // Validate required state before starting
        if (!state.assemblyResult || !state.exportRequest || !state.caseId) {
            console.error('[ReviewHub] Missing required state for drafting');
            return;
        }

        // 🔒 Race Condition Guard (Invariant H1)
        // Re-run detectCourtDocumentIssues against latest merged state.
        // If blockers remain, DO NOT start SSE request.
        if (state.exportPath === 'court_document') {
            // Full source set: merge patch with courtSettings and nexProfile
            // so the client-side gate matches the backend resolution.
            const identity = resolveCourtIdentity({
                patch: state.courtIdentityPatch ?? undefined,
                extractedFromText,
                courtSettings: courtSettingsData,
                userProfile: userProfileData,
                nexProfile: nexProfileData,
            });
            const itemTexts = buildCourtIssueTexts(effectiveItems, state.courtResolvedText);
            const freshIssues = detectCourtDocumentIssues(
                identity,
                { documentType: identity.documentKind, exportPath: state.exportPath },
                itemTexts,
            );
            const freshBlockers = freshIssues.filter(i => i.severity === 'blocker');
            if (freshBlockers.length > 0) {
                dispatch({ type: 'SET_COURT_ISSUES', issues: freshIssues });
                dispatch({ type: 'SHOW_COURT_CLARIFICATION', show: true });
                return;
            }
        }

        draftingGuardRef.current = true;
        if (pendingEditRef.current) {
            editItem(pendingEditRef.current.nodeId, pendingEditRef.current.text);
            pendingEditRef.current = null;
        }

        setIsDrafting(true);
        startDrafting();

        // Build stream input and fire
        const input: DraftStreamInput = {
            assemblyResult: state.assemblyResult,
            overrides: state.overrides,
            exportRequest: state.exportRequest,
            reviewItems: effectiveItems,
            caseId: state.caseId,
            retryOfExportId: retryExportIdRef.current ?? undefined,
            courtIdentityPatch: state.courtIdentityPatch ?? undefined,
            identitySourceText: state.exportPath === 'court_document'
                ? buildCourtIdentitySourceText(
                    state.exportRequest,
                    state.assemblyResult,
                    effectiveItems,
                    state.courtResolvedText,
                )
                : undefined,
        };
        retryExportIdRef.current = null; // Clear after use

        // startStream is async — handle rejection to reset guards
        startStream(input).catch((err) => {
            draftingGuardRef.current = false;
            setIsDrafting(false);
            console.error('[ReviewHub] Stream start failed:', err);
            dispatch({ type: 'ERROR', message: String(err), errorCode: 'draft_failed' });
        });
    }, [editItem, startDrafting, startStream, state, effectiveItems, dispatch]);

    /** Confirm before discarding all review work. */
    const handleReset = useCallback(() => {
        if (window.confirm('Exit review? Unsaved changes will be lost.')) {
            abort();
            draftingGuardRef.current = false;
            setIsDrafting(false);
            reset();
            router.push('/docuvault');
        }
    }, [reset, abort, router]);

    /** Retry: preserve failed exportId for linkage, then reset to reviewing. */
    const handleRetry = useCallback(() => {
        // Capture failed exportId before RESET clears it
        retryExportIdRef.current = state.exportId;
        draftingGuardRef.current = false;
        setIsDrafting(false);
        dispatch({ type: 'RESET' });
    }, [dispatch, state.exportId]);

    /** Return to review canvas without losing work (assembly + edits preserved). */
    const handleBackToReview = useCallback(() => {
        draftingGuardRef.current = false;
        setIsDrafting(false);
        dispatch({ type: 'BACK_TO_REVIEW' });
    }, [dispatch]);

    /** Auto-save any pending sidebar edit before switching selection. */
    const handleSelectItem = useCallback((nodeId: string | null) => {
        if (pendingEditRef.current) {
            editItem(pendingEditRef.current.nodeId, pendingEditRef.current.text);
            pendingEditRef.current = null;
        }
        setSelectedItemId(nodeId);
        if (nodeId === null) {
            setRevisingItemId(null);
        }
    }, [editItem]);

    const handleReviseItem = useCallback((nodeId: string | null) => {
        if (pendingEditRef.current) {
            editItem(pendingEditRef.current.nodeId, pendingEditRef.current.text);
            pendingEditRef.current = null;
        }
        setRevisingItemId(nodeId);
    }, [editItem]);

    // =========================================================================
    // Phase Routing
    // =========================================================================

    // Drafting phase — step checklist
    if (state.phase === 'drafting') {
        return <DraftingPhaseUI state={state} onCancel={handleReset} />;
    }

    // Completed phase — success card
    if (state.phase === 'completed') {
        return <CompletedPhaseUI state={state} onNewExport={handleReset} />;
    }

    // Error phase — error card
    if (state.phase === 'error') {
        return <ErrorPhaseUI state={state} onRetry={handleRetry} onBackToReview={handleBackToReview} onReset={handleReset} />;
    }

    // Guard: only render canvas during reviewing phase
    if (state.phase !== 'reviewing') {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-4">
                    <p className="text-white/40">No active review session.</p>
                    <button
                        type="button"
                        onClick={() => router.push('/docuvault')}
                        className="px-6 py-3 rounded-xl text-[13px] font-bold text-white bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] border border-white/20 shadow-[0_4px_16px_rgba(26,75,155,0.3)] hover:shadow-[0_8px_24px_rgba(26,75,155,0.4)] transition-all"
                    >
                        Back to DocuVault
                    </button>
                </div>
            </div>
        );
    }

    // =========================================================================
    // Reviewing Phase (main canvas)
    // =========================================================================

    return (
        <div className="flex h-full overflow-hidden">
            {/* ── Main Canvas Area ── */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header Bar */}
                <div className="shrink-0 px-6 py-4 border-b border-white/10 bg-[rgba(10,17,40,0.6)] backdrop-blur-xl">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                type="button"
                                onClick={handleReset}
                                className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                                aria-label="Exit review and reset"
                            >
                                <ArrowLeft size={16} weight="bold" />
                            </button>
                            <div>
                                <h1 className="text-[17px] font-bold text-white tracking-tight font-[family-name:var(--font-playfair)]">
                                    Review Hub
                                </h1>
                                <p className="text-[12px] text-white/50">
                                    {getExportLabel(state.exportPath)}
                                    {' · '}
                                    {sectionCount} sections · {includedItems}/{totalItems} items
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {lockedSections > 0 && (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold">
                                    <CheckCircle size={14} weight="fill" />
                                    {lockedSections} locked
                                </div>
                            )}

                            {/* Approve & Draft */}
                            <button
                                type="button"
                                onClick={handleApproveAndDraft}
                                disabled={isDrafting || !canExportCourtDocument}
                                className={`px-5 py-2.5 rounded-xl text-[13px] font-bold tracking-wide text-white border border-white/25 transition-all flex items-center gap-2 ${
                                    isDrafting
                                        ? 'bg-white/10 cursor-not-allowed opacity-60'
                                        : 'btn-primary shadow-[0_4px_16px_rgba(26,75,155,0.3),inset_0_1px_1px_rgba(255,255,255,0.2)] hover:shadow-[0_8px_24px_rgba(26,75,155,0.4)] hover:-translate-y-0.5'
                                }`}
                            >
                                <Export size={16} weight="bold" />
                                {isDrafting ? 'Drafting…' : 'Approve & Draft'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Court Issues Banner */}
                {isCourtDocument && courtBlockers.length > 0 && (
                    <div className="mx-6 mt-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                        <p className="text-amber-300 text-[13px] font-medium">
                            This document needs {courtBlockers.length} court-filing detail{courtBlockers.length > 1 ? 's' : ''} before export.
                        </p>
                        <button
                            type="button"
                            onClick={() => dispatch({ type: 'SHOW_COURT_CLARIFICATION', show: true })}
                            className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 text-[12px] font-bold hover:bg-amber-500/30 transition-colors"
                        >
                            Resolve Issues
                        </button>
                    </div>
                )}

                {/* Canvas */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Mapping Canvas */}
                    <div className="flex-1 overflow-y-auto p-6" style={{ scrollbarWidth: 'thin' }}>
                        <MappingCanvas
                            sectionGroups={sectionGroups}
                            overrides={state.overrides}
                            selectedItemId={selectedItemId}
                            onSelectItem={handleSelectItem}
                            onLockSection={lockSection}
                            onExcludeItem={excludeItem}
                            onEditItem={editItem}
                            onReviseItem={handleReviseItem}
                            onMoveItem={moveItem}
                        />
                    </div>
                </div>
            </div>

            {/* ── Revision Modal Overlay ── */}
            <RevisionModal
                isOpen={!!revisingItemId}
                item={effectiveItems.find(i => i.nodeId === revisingItemId) || null}
                onClose={() => setRevisingItemId(null)}
                onAcceptRevision={(text) => {
                    if (revisingItemId) editItem(revisingItemId, text);
                    setRevisingItemId(null);
                }}
            />

            {/* ── Clarification Modal Overlay ── */}
            <ClarificationModal
                isOpen={showClarificationModal || state.showCourtClarification}
                onClose={() => {
                    setShowClarificationModal(false);
                    dispatch({ type: 'SHOW_COURT_CLARIFICATION', show: false });
                }}
                rawDocumentText={
                    effectiveItems.map(i => i.originalText).join('\n\n')
                }
                onContinue={(action, details, resolvedText) => {
                    console.log('[ReviewHub] Clarification resolved:', action, details);
                    setShowClarificationModal(false);
                    dispatch({ type: 'SHOW_COURT_CLARIFICATION', show: false });
                    if (resolvedText && action === 'generate_titles') {
                        console.log('[ReviewHub] Structured text received (%d chars). Awaiting assembly re-parse integration.', resolvedText.length);
                    }
                }}
                courtMode={courtMode}
                courtIssues={state.courtIssues}
                courtIdentity={resolvedIdentity}
                onResolve={(resolution) => {
                    if (resolution.type === 'patch_court_identity') {
                        dispatch({
                            type: 'APPLY_COURT_RESOLUTION',
                            patch: resolution.patch,
                            resolvedText: resolution.resolvedText,
                        });
                    } else if (resolution.type === 'send_to_nexchat') {
                        const stored = storeCourtHandoff({
                            source: 'clarification_modal',
                            intent: 'fix_court_issues',
                            caseId: state.caseId ? String(state.caseId) : undefined,
                            exportPath: 'court_document',
                            courtIdentity: state.courtIdentityPatch ?? {},
                            issues: (state.courtIssues ?? []).map(i => ({ id: i.id, severity: i.severity })),
                            draftText: effectiveItems.map(i => i.originalText).join('\n\n').slice(0, 3000),
                            requestedOutcome: 'Fix court document issues identified during export review.',
                            timestamp: Date.now(),
                            schemaVersion: 1,
                        });
                        if (!stored) {
                            console.warn('[ReviewHub] Court handoff storage failed; context may be unavailable in chat.');
                        }
                        dispatch({ type: 'SHOW_COURT_CLARIFICATION', show: false });
                        router.push('/chat?handoff=court');
                    }
                    // After resolution, issues will be recomputed by the useEffect above
                }}
                onSaveToSettings={async (patch) => {
                    try {
                        const identity = resolvedIdentity;
                        await upsertCourtSettings({
                            state: patch.state ?? identity?.state ?? '',
                            county: patch.county ?? identity?.county ?? '',
                            ...(patch.courtName ? { courtName: patch.courtName } : {}),
                            ...(patch.judicialDistrict ? { judicialDistrict: patch.judicialDistrict } : {}),
                            ...(patch.causeNumber ? { causeNumber: patch.causeNumber } : {}),
                            ...(patch.assignedJudge ? { assignedJudge: patch.assignedJudge } : {}),
                            // Party fields — role-aware mapping to courtSettings schema.
                            // Caption names take priority (already role-correct).
                            ...(patch.captionPetitionerName ? { petitionerLegalName: patch.captionPetitionerName } : {}),
                            ...(patch.captionRespondentName ? { respondentLegalName: patch.captionRespondentName } : {}),
                            // Fallback: map filingParty/opposingParty based on actual role
                            ...(!patch.captionPetitionerName && !patch.captionRespondentName && patch.filingPartyLegalName
                                ? (patch.filingPartyRole === 'respondent' || identity?.filingPartyRole === 'respondent'
                                    ? { respondentLegalName: patch.filingPartyLegalName }
                                    : { petitionerLegalName: patch.filingPartyLegalName })
                                : {}),
                            ...(!patch.captionPetitionerName && !patch.captionRespondentName && patch.opposingPartyLegalName
                                ? (patch.filingPartyRole === 'respondent' || identity?.filingPartyRole === 'respondent'
                                    ? { petitionerLegalName: patch.opposingPartyLegalName }
                                    : { respondentLegalName: patch.opposingPartyLegalName })
                                : {}),
                        });
                        return true;
                    } catch (err) {
                        console.error('[ReviewHub] Failed to save to court settings:', err);
                        return false;
                    }
                }}
                resolvedFieldSources={resolvedIdentity?.fieldSources}
            />
        </div>
    );
}

// AssemblyValidationBanner removed in Review Hub redesign (Phase 1)

// =========================================================================
// Drafting Phase — Step Checklist
// =========================================================================

/** Step-by-step drafting progress checklist with animated indicators. */
function DraftingPhaseUI({
    state,
    onCancel,
}: {
    state: ReturnType<typeof useExport>['state'];
    onCancel: () => void;
}) {
    const currentStageIndex = DRAFTING_STAGES.findIndex(s => s.key === state.draftingStage);

    return (
        <div className="flex items-center justify-center h-full">
            <div className="w-full max-w-md p-4 rounded-2xl bg-[rgba(10,17,40,0.8)] border border-white/10 backdrop-blur-xl">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-[#1A4B9B]/20 border border-[#1A4B9B]/40 flex items-center justify-center">
                        <SpinnerGap size={20} className="text-[#60A5FA] animate-spin" />
                    </div>
                    <div>
                        <h2 className="text-[16px] font-bold text-white">Generating Export</h2>
                        <p className="text-[12px] text-white/50">{state.statusDetail}</p>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-white/5 rounded-full mb-6 overflow-hidden">
                    <motion.div
                        className="h-full bg-gradient-to-r from-[#1A4B9B] to-[#60A5FA] rounded-full"
                        initial={{ width: `${state.progress}%` }}
                        animate={{ width: `${state.progress}%` }}
                        transition={{ ease: 'easeOut', duration: 0.5 }}
                    />
                </div>

                {/* Step checklist */}
                <div className="space-y-3">
                    {DRAFTING_STAGES.map((stage, i) => {
                        const isCompleted = i < currentStageIndex;
                        const isActive = i === currentStageIndex;
                        const isPending = i > currentStageIndex;

                        return (
                            <div key={stage.key} className="flex items-center gap-3">
                                {isCompleted && (
                                    <CheckCircle size={18} weight="fill" className="text-emerald-400 shrink-0" />
                                )}
                                {isActive && (
                                    <SpinnerGap size={18} className="text-[#60A5FA] animate-spin shrink-0" />
                                )}
                                {isPending && (
                                    <Circle size={18} className="text-white/20 shrink-0" />
                                )}
                                <span className={`text-[13px] ${
                                    isCompleted ? 'text-white/60' :
                                    isActive ? 'text-white font-semibold' :
                                    'text-white/30'
                                }`}>
                                    {stage.label}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Cancel button */}
                <button
                    type="button"
                    onClick={onCancel}
                    className="mt-6 w-full py-2.5 rounded-xl text-[12px] font-bold text-white/50 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white/70 transition-colors"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

// =========================================================================
// Completed Phase — Success Card
// =========================================================================

/** Success card shown after export completes — download link, stats, and new export button. */
function CompletedPhaseUI({
    state,
    onNewExport,
}: {
    state: ReturnType<typeof useExport>['state'];
    onNewExport: () => void;
}) {
    const preflightPassCount = state.preflight?.checks.filter(c => c.severity === 'pass').length ?? 0;
    const preflightWarnCount = state.preflight?.warningCount ?? 0;
    const preflightErrorCount = state.preflight?.errorCount ?? 0;
    const downloadUrl = state.exportId
        ? `/api/documents/export/${state.exportId}/download`
        : null;

    return (
        <div className="flex items-center justify-center h-full">
            <div className="w-full max-w-lg p-4 rounded-2xl bg-[rgba(10,17,40,0.8)] border border-white/10 backdrop-blur-xl">
                {/* Success header */}
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                        <CheckCircle size={28} weight="fill" className="text-emerald-400" />
                    </div>
                    <div>
                        <h2 className="text-[18px] font-bold text-white">Export Complete</h2>
                        <p className="text-[13px] text-white/50">
                            {state.filename ?? 'Document generated successfully'}
                        </p>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                        <p className="text-[11px] text-white/40 uppercase tracking-wider mb-1">Items</p>
                        <p className="text-[18px] font-bold text-white">
                            {state.reviewItems.length}
                        </p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                        <p className="text-[11px] text-white/40 uppercase tracking-wider mb-1">Preflight</p>
                        <p className="text-[14px] font-bold text-white">
                            <span className="text-emerald-400">{preflightPassCount} ✓</span>
                            {preflightWarnCount > 0 && (
                                <span className="text-amber-400 ml-1">{preflightWarnCount} ⚠</span>
                            )}
                            {preflightErrorCount > 0 && (
                                <span className="text-red-400 ml-1">{preflightErrorCount} ✕</span>
                            )}
                        </p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                        <p className="text-[11px] text-white/40 uppercase tracking-wider mb-1">Export</p>
                        <p className="text-[13px] font-semibold text-white/70">
                            {getExportLabel(state.exportPath)}
                        </p>
                    </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 mb-4">
                    {/* Download PDF */}
                    {downloadUrl && (
                        <a
                            href={downloadUrl}
                            download={state.filename ?? 'export.pdf'}
                            className="flex-1 py-3 rounded-xl text-[13px] font-bold text-white text-center bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] border border-white/20 shadow-[0_4px_16px_rgba(26,75,155,0.3)] hover:shadow-[0_8px_24px_rgba(26,75,155,0.4)] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                        >
                            <Download size={16} weight="bold" />
                            Download PDF
                        </a>
                    )}

                    {/* View in DocuVault */}
                    <a
                        href="/docuvault"
                        className="flex-1 py-3 rounded-xl text-[13px] font-bold text-white/70 text-center bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                        <ArrowSquareOut size={16} />
                        View in DocuVault
                    </a>
                </div>

                {/* Start new export */}
                <button
                    type="button"
                    onClick={onNewExport}
                    className="w-full py-2.5 rounded-xl text-[12px] font-bold text-white/50 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white/70 transition-colors"
                >
                    Start New Export
                </button>
            </div>
        </div>
    );
}

// =========================================================================
// Error Phase
// =========================================================================

/** Error recovery UI with stage-aware retry and back-to-DocuVault navigation. */
function ErrorPhaseUI({
    state,
    onRetry,
    onBackToReview,
    onReset,
}: {
    state: ReturnType<typeof useExport>['state'];
    onRetry: () => void;
    onBackToReview: () => void;
    onReset: () => void;
}) {
    // Scoped retry label based on last completed stage
    const retryLabel = (() => {
        switch (state.lastCompletedStage) {
            case 'draft': return 'Retry from Preflight';
            case 'preflight': return 'Retry from Render';
            case 'render': return 'Retry from Upload';
            case 'upload': return 'Retry from Save';
            default: return 'Full Rerun';
        }
    })();

    return (
        <div className="flex items-center justify-center h-full">
            <div className="w-full max-w-md p-4 rounded-2xl bg-[rgba(10,17,40,0.8)] border border-red-500/20 backdrop-blur-xl">
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                        <XCircle size={28} weight="fill" className="text-red-400" />
                    </div>
                    <div>
                        <h2 className="text-[16px] font-bold text-white">Export Failed</h2>
                        {state.errorCode && (
                            <p className="text-[11px] text-red-400/70 font-mono">{state.errorCode}</p>
                        )}
                    </div>
                </div>

                <p className="text-[13px] text-white/60 mb-2">
                    {getErrorDescription(state.errorCode)}
                </p>
                {state.errorMessage && (
                    <details className="mb-6">
                        <summary className="text-[11px] text-white/30 cursor-pointer hover:text-white/50 transition-colors">
                            Show technical details
                        </summary>
                        <div className="mt-2 p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                            <p className="text-[12px] text-red-300/80 font-mono break-all">
                                {state.errorMessage}
                            </p>
                        </div>
                    </details>
                )}

                {/* Stage-aware retry info */}
                {state.lastCompletedStage && (
                    <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                        <CheckCircle size={14} weight="fill" className="text-emerald-400 shrink-0" />
                        <p className="text-[11px] text-white/50">
                            Last checkpoint: <span className="font-bold text-white/70">{state.lastCompletedStage}</span>
                            {' '}— draft artifacts preserved
                        </p>
                    </div>
                )}

                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={onRetry}
                        className="flex-1 py-3 rounded-xl text-[13px] font-bold text-white bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] border border-white/20 shadow-[0_4px_16px_rgba(26,75,155,0.3)] hover:shadow-[0_8px_24px_rgba(26,75,155,0.4)] transition-all flex items-center justify-center gap-2"
                    >
                        <ArrowClockwise size={16} weight="bold" />
                        {retryLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onBackToReview}
                        className="flex-1 py-3 rounded-xl text-[13px] font-bold text-white/80 bg-white/10 border border-white/15 hover:bg-white/15 hover:text-white transition-colors flex items-center justify-center gap-2"
                    >
                        <ArrowLeft size={16} weight="bold" />
                        Back to Review
                    </button>
                    <button
                        type="button"
                        onClick={onReset}
                        className="py-3 px-4 rounded-xl text-[13px] font-bold text-white/40 bg-transparent border border-white/10 hover:bg-white/5 hover:text-white/60 transition-colors"
                    >
                        Exit
                    </button>
                </div>
            </div>
        </div>
    );
}
