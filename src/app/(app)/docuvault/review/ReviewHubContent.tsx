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
    WarningCircle,
    Download,
    ArrowSquareOut,
    ArrowClockwise,
    SpinnerGap,
    Circle,
    XCircle,
    ShieldWarning,
    CaretDown,
    CaretUp,
} from '@phosphor-icons/react';
import { useExport, type DraftingStage } from '../context/ExportContext';
import { useDraftingStream, type DraftStreamInput } from '@/hooks/useDraftingStream';
import { runPreflightChecks } from '@/lib/export-assembly/validation/preflightValidator';
import MappingCanvas from '@/components/review/MappingCanvas';
import TraceSidebar from '@/components/review/TraceSidebar';
import PreflightPanel from '@/components/review/PreflightPanel';
import DraftStyleToggle from '@/components/review/DraftStyleToggle';
import type { MappingReviewItem } from '@/lib/export-assembly/types/exports';

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
    const [isDrafting, setIsDrafting] = useState(false);
    const [showPreflight, setShowPreflight] = useState(false);
    const [textMode, setTextMode] = useState<'original' | 'court_safe'>('original');
    const [validationExpanded, setValidationExpanded] = useState(true);

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
    const { totalItems, includedItems, lowConfidenceCount, lockedSections, sectionCount } = useMemo(() => {
        // Respect explicit reviewer overrides (re-include or exclude)
        const isExcluded = (i: MappingReviewItem) =>
            i.userOverride?.exclude ?? !i.includedInExport;

        const total = effectiveItems.length;
        const included = effectiveItems.filter(i => !isExcluded(i)).length;
        const lowConf = effectiveItems.filter(i => i.confidence < 0.5 && !isExcluded(i)).length;
        const locked = state.overrides.sectionOverrides.filter(s => s.isLocked).length;
        return {
            totalItems: total,
            includedItems: included,
            lowConfidenceCount: lowConf,
            lockedSections: locked,
            sectionCount: sectionGroups.size,
        };
    }, [effectiveItems, state.overrides.sectionOverrides, sectionGroups.size]);

    // Find selected item
    const selectedItem = useMemo(
        () => effectiveItems.find(i => i.nodeId === selectedItemId) ?? null,
        [effectiveItems, selectedItemId],
    );

    /** Run manual preflight checks. */
    const handleRunPreflight = useCallback(() => {
        try {
            const classifiedNodes = state.assemblyResult?.assembly?.classifiedNodes ?? [];
            const fastPath = classifiedNodes.length === 1 && classifiedNodes[0].tags?.includes('pre_drafted');
            const result = runPreflightChecks({
                exportPath: state.exportPath ?? 'court_document',
                config: (state.exportRequest?.config ?? {}) as Record<string, unknown>,
                reviewItems: effectiveItems,
                overrides: state.overrides,
                isFastPath: fastPath,
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
    }, [state.exportPath, state.exportRequest, effectiveItems, state.overrides, setPreflight]);

    /** Flush any pending sidebar edit + start GPT drafting (synchronous guard). */
    const handleApproveAndDraft = useCallback(() => {
        if (draftingGuardRef.current) return;

        // Validate required state before starting
        if (!state.assemblyResult || !state.exportRequest || !state.caseId) {
            console.error('[ReviewHub] Missing required state for drafting');
            return;
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

    /** Auto-save any pending sidebar edit before switching selection. */
    const handleSelectItem = useCallback((nodeId: string | null) => {
        if (pendingEditRef.current) {
            editItem(pendingEditRef.current.nodeId, pendingEditRef.current.text);
            pendingEditRef.current = null;
        }
        setSelectedItemId(nodeId);
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
        return <ErrorPhaseUI state={state} onRetry={handleRetry} onReset={handleReset} />;
    }

    // Guard: only render canvas during reviewing phase
    if (state.phase !== 'reviewing') {
        return (
            <div className="flex items-center justify-center h-full text-white/40">
                <p>No active review session. Start an export from DocuVault.</p>
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
                                <h1 className="text-[17px] font-bold text-white tracking-tight">
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
                            {/* Stats Badges */}
                            {lowConfidenceCount > 0 && (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-bold">
                                    <WarningCircle size={14} weight="fill" />
                                    {lowConfidenceCount} low confidence
                                </div>
                            )}
                            {lockedSections > 0 && (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold">
                                    <CheckCircle size={14} weight="fill" />
                                    {lockedSections} locked
                                </div>
                            )}

                            {/* Text Mode Toggle */}
                            <DraftStyleToggle
                                mode={textMode}
                                onChange={setTextMode}
                            />

                            {/* Preflight Button */}
                            <button
                                type="button"
                                onClick={handleRunPreflight}
                                className={`px-4 py-2 rounded-xl text-[12px] font-bold tracking-wide transition-all flex items-center gap-2 ${
                                    showPreflight && state.preflight
                                        ? 'bg-[#60A5FA]/15 border border-[#60A5FA]/40 text-[#60A5FA]'
                                        : 'bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10'
                                }`}
                            >
                                <Lightning size={14} weight="fill" />
                                Preflight
                            </button>

                            {/* Approve & Draft — gated by critical validation */}
                            <button
                                type="button"
                                onClick={handleApproveAndDraft}
                                disabled={isDrafting || (state.assemblyValidation?.critical?.length ?? 0) > 0}
                                title={(state.assemblyValidation?.critical?.length ?? 0) > 0 ? 'Resolve critical validation issues first' : undefined}
                                className={`px-5 py-2.5 rounded-xl text-[13px] font-bold tracking-wide text-white border border-white/25 transition-all flex items-center gap-2 ${
                                    isDrafting || (state.assemblyValidation?.critical?.length ?? 0) > 0
                                        ? 'bg-white/10 cursor-not-allowed opacity-60'
                                        : 'bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] shadow-[0_4px_16px_rgba(26,75,155,0.3),inset_0_1px_1px_rgba(255,255,255,0.2)] hover:shadow-[0_8px_24px_rgba(26,75,155,0.4)] hover:-translate-y-0.5'
                                }`}
                            >
                                <Export size={16} weight="bold" />
                                {isDrafting ? 'Drafting…' : 'Approve & Draft'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── Assembly Validation Banner ── */}
                {state.assemblyValidation && (
                    <AssemblyValidationBanner
                        validation={state.assemblyValidation}
                        expanded={validationExpanded}
                        onToggle={() => setValidationExpanded(!validationExpanded)}
                    />
                )}

                {/* Canvas + Preflight */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Mapping Canvas */}
                    <div className="flex-1 overflow-y-auto p-6" style={{ scrollbarWidth: 'thin' }}>
                        <MappingCanvas
                            sectionGroups={sectionGroups}
                            overrides={state.overrides}
                            textMode={textMode}
                            selectedItemId={selectedItemId}
                            onSelectItem={handleSelectItem}
                            onLockSection={lockSection}
                            onExcludeItem={excludeItem}
                            onEditItem={editItem}
                            onMoveItem={moveItem}
                        />
                    </div>

                    {/* Preflight Panel (slides in) */}
                    <AnimatePresence>
                        {showPreflight && state.preflight && (
                            <motion.div
                                key="preflight-panel"
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: 320, opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                transition={{ type: 'spring', duration: 0.4 }}
                                className="shrink-0 border-l border-white/10 overflow-hidden"
                            >
                                <PreflightPanel
                                    result={state.preflight}
                                    onClose={() => setShowPreflight(false)}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* ── Trace Sidebar ── */}
            <AnimatePresence>
                {selectedItem && (
                    <motion.div
                        key={`trace-sidebar-${selectedItem.nodeId}`}
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 380, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ type: 'spring', duration: 0.4 }}
                        className="shrink-0 border-l border-white/10 overflow-hidden"
                    >
                        <TraceSidebar
                            item={selectedItem}
                            onClose={() => handleSelectItem(null)}
                            onTextChange={(text) => {
                                // null = user canceled edit, clear pending draft
                                pendingEditRef.current = text != null
                                    ? { nodeId: selectedItem.nodeId, text }
                                    : null;
                            }}
                            onEditText={(text) => {
                                editItem(selectedItem.nodeId, text);
                                pendingEditRef.current = null; // Clear after explicit save
                            }}
                            onExclude={(excluded) => excludeItem(selectedItem.nodeId, excluded)}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// =========================================================================
// Assembly Validation Banner (extracted for testability)
// =========================================================================

/** Collapsible banner displaying assembly integrity validation results. */
function AssemblyValidationBanner({
    validation,
    expanded,
    onToggle,
}: {
    validation: { critical: { id: string; label: string; detail: string }[]; errors: { id: string; label: string; detail: string }[]; warnings: { id: string; label: string; detail: string }[] };
    expanded: boolean;
    onToggle: () => void;
}) {
    const { critical, errors, warnings } = validation;
    const totalIssues = critical.length + errors.length + warnings.length;
    if (totalIssues === 0) return null;

    const highestSeverity = critical.length > 0 ? 'critical' : errors.length > 0 ? 'error' : 'warning';
    const bannerColors = {
        critical: 'bg-red-500/10 border-red-500/30 text-red-400',
        error: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        warning: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    };

    return (
        <div className={`shrink-0 mx-6 mt-4 rounded-xl border ${bannerColors[highestSeverity]} overflow-hidden`}>
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
            >
                <ShieldWarning size={18} weight="fill" />
                <span className="text-[13px] font-bold">
                    {critical.length > 0 && `${critical.length} critical`}
                    {critical.length > 0 && errors.length > 0 && ' · '}
                    {errors.length > 0 && `${errors.length} error${errors.length > 1 ? 's' : ''}`}
                    {(critical.length > 0 || errors.length > 0) && warnings.length > 0 && ' · '}
                    {warnings.length > 0 && `${warnings.length} warning${warnings.length > 1 ? 's' : ''}`}
                </span>
                {critical.length > 0 && (
                    <span className="text-[11px] font-medium ml-auto mr-2 text-red-300">
                        Blocks drafting
                    </span>
                )}
                {expanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
            </button>
            <AnimatePresence>{expanded && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                >
                    <div className="px-4 pb-3 space-y-1.5">
                        {critical.map(item => (
                            <div key={item.id} className="flex items-start gap-2.5 text-[12px]">
                                <XCircle size={14} weight="fill" className="text-red-400 mt-0.5 shrink-0" />
                                <div>
                                    <span className="font-bold text-red-300">{item.label}</span>
                                    <span className="text-red-400/80 ml-1">{item.detail}</span>
                                </div>
                            </div>
                        ))}
                        {errors.map(item => (
                            <div key={item.id} className="flex items-start gap-2.5 text-[12px]">
                                <WarningCircle size={14} weight="fill" className="text-amber-400 mt-0.5 shrink-0" />
                                <div>
                                    <span className="font-bold text-amber-300">{item.label}</span>
                                    <span className="text-amber-400/80 ml-1">{item.detail}</span>
                                </div>
                            </div>
                        ))}
                        {warnings.map(item => (
                            <div key={item.id} className="flex items-start gap-2.5 text-[12px]">
                                <WarningCircle size={14} weight="regular" className="text-yellow-400 mt-0.5 shrink-0" />
                                <div>
                                    <span className="font-bold text-yellow-300">{item.label}</span>
                                    <span className="text-yellow-400/80 ml-1">{item.detail}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}</AnimatePresence>
        </div>
    );
}

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
            <div className="w-full max-w-md p-8 rounded-2xl bg-[rgba(10,17,40,0.8)] border border-white/10 backdrop-blur-xl">
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
            <div className="w-full max-w-lg p-8 rounded-2xl bg-[rgba(10,17,40,0.8)] border border-white/10 backdrop-blur-xl">
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
    onReset,
}: {
    state: ReturnType<typeof useExport>['state'];
    onRetry: () => void;
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
            <div className="w-full max-w-md p-8 rounded-2xl bg-[rgba(10,17,40,0.8)] border border-red-500/20 backdrop-blur-xl">
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
                        onClick={onReset}
                        className="flex-1 py-3 rounded-xl text-[13px] font-bold text-white/60 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
                    >
                        Back to DocuVault
                    </button>
                </div>
            </div>
        </div>
    );
}
