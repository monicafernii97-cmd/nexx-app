'use client';

/**
 * Review Hub Content — The product center of the export pipeline.
 *
 * This client component is shown during the 'reviewing' phase. It renders:
 * - MappingCanvas: Section tiles with review items
 * - TraceSidebar: Source provenance + "why this section?" explanation
 * - PreflightPanel: Filing readiness score
 * - Inline editing, locking, and drag-to-reorder
 *
 * The user approves the assembly output here before GPT drafting begins.
 */

import { useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft,
    Lightning,
    Export,
    CheckCircle,
    WarningCircle,
} from '@phosphor-icons/react';
import { useExport } from '../context/ExportContext';
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Client-side Review Hub content (requires ExportProvider context). */
export default function ReviewHubContent() {
    const {
        state,
        lockSection,
        editItem,
        moveItem,
        excludeItem,
        startDrafting,
        reset,
    } = useExport();

    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [textMode, setTextMode] = useState<'original' | 'court_safe'>('original');
    const [showPreflight, setShowPreflight] = useState(false);
    const [isDrafting, setIsDrafting] = useState(false);

    // Track sidebar edit state to auto-save on selection change
    const pendingEditRef = useRef<{ nodeId: string; text: string } | null>(null);

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

    /** Flush any pending sidebar edit + start GPT drafting (with double-click guard). */
    const handleApproveAndDraft = useCallback(() => {
        if (isDrafting) return; // Prevent double-submission
        if (pendingEditRef.current) {
            editItem(pendingEditRef.current.nodeId, pendingEditRef.current.text);
            pendingEditRef.current = null;
        }
        setIsDrafting(true);
        startDrafting();
    }, [editItem, startDrafting, isDrafting]);

    /** Confirm before discarding all review work. */
    const handleReset = useCallback(() => {
        if (window.confirm('Exit review? Unsaved changes will be lost.')) {
            reset();
        }
    }, [reset]);

    /** Auto-save any pending sidebar edit before switching selection. */
    const handleSelectItem = useCallback((nodeId: string | null) => {
        // If there's a pending edit from the sidebar, auto-save it
        if (pendingEditRef.current) {
            editItem(pendingEditRef.current.nodeId, pendingEditRef.current.text);
            pendingEditRef.current = null;
        }
        setSelectedItemId(nodeId);
    }, [editItem]);

    // Guard: only render during reviewing phase
    if (state.phase !== 'reviewing') {
        return (
            <div className="flex items-center justify-center h-full text-white/40">
                <p>No active review session. Start an export from DocuVault.</p>
            </div>
        );
    }

    const preflightAvailable = !!state.preflight;

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

                            {/* Preflight Button — disabled when data unavailable */}
                            <button
                                type="button"
                                onClick={() => preflightAvailable && setShowPreflight(!showPreflight)}
                                disabled={!preflightAvailable}
                                className={`px-4 py-2 rounded-xl text-[12px] font-bold tracking-wide transition-all flex items-center gap-2 ${
                                    !preflightAvailable
                                        ? 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed'
                                        : showPreflight
                                            ? 'bg-[#60A5FA]/15 border border-[#60A5FA]/40 text-[#60A5FA]'
                                            : 'bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10'
                                }`}
                            >
                                <Lightning size={14} weight="fill" />
                                Preflight
                            </button>

                            {/* Approve & Draft */}
                            <button
                                type="button"
                                onClick={handleApproveAndDraft}
                                disabled={isDrafting}
                                className={`px-5 py-2.5 rounded-xl text-[13px] font-bold tracking-wide text-white border border-white/25 transition-all flex items-center gap-2 ${
                                    isDrafting
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
