'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    Gavel,
    ClipboardText,
    Package,
    CaretDown,
    Check,
    Lightning,
    Sliders,
    ArrowsClockwise,
    Info,
} from '@phosphor-icons/react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { ExportPath } from '@/lib/export-assembly/types/exports';
import {
    EXPORT_PATH_LABELS,
    EXPORT_PATH_DESCRIPTIONS,
    EXPORT_PATHS,
} from '@/lib/export-assembly/exportPathLabels';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration collected from the modal before assembly. */
export interface ExportConfig {
    path: ExportPath;
    caseId: Id<'cases'>;
    templateId?: string;
    includeTimeline: boolean;
    includeExhibits: boolean;
    narrativeDepth: 'light' | 'standard' | 'full';
    jurisdictionProfileId?: string;
}

interface CreateExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (config: ExportConfig) => Promise<void>;
    defaultCaseId?: Id<'cases'>;
    lockCaseSelection?: boolean;
}

// ---------------------------------------------------------------------------
// Path Card Icons
// ---------------------------------------------------------------------------

const PATH_ICONS: Record<ExportPath, typeof Gavel> = {
    court_document: Gavel,
    case_summary: ClipboardText,
    exhibit_document: Package,
};

// ---------------------------------------------------------------------------
// Narrative Depth options
// ---------------------------------------------------------------------------

const DEPTH_OPTIONS: { value: ExportConfig['narrativeDepth']; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'standard', label: 'Standard' },
    { value: 'full', label: 'Full' },
];

/** Default "Include Exhibits" per path. */
const DEFAULT_EXHIBITS: Record<ExportPath, boolean> = {
    court_document: false,
    case_summary: false,
    exhibit_document: true,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * CreateExportModal — Two-column modal for configuring a structured export.
 *
 * Left column: export path selection cards.
 * Right column: configuration panel.
 * Footer: Cancel + Run Assembly.
 */
export default function CreateExportModal({
    isOpen,
    onClose,
    onSubmit,
    defaultCaseId,
    lockCaseSelection = false,
}: CreateExportModalProps) {
    // ── Form state ──
    const [selectedPath, setSelectedPath] = useState<ExportPath>('court_document');
    const [selectedCaseId, setSelectedCaseId] = useState<Id<'cases'> | null>(defaultCaseId ?? null);
    const [includeTimeline, setIncludeTimeline] = useState(false);
    const [includeExhibits, setIncludeExhibits] = useState(DEFAULT_EXHIBITS['court_document']);
    const [narrativeDepth, setNarrativeDepth] = useState<ExportConfig['narrativeDepth']>('standard');

    // ── Submit guard ──
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submitGuardRef = useRef(false);

    // ── Data ──
    const cases = useQuery(api.cases.list);

    // ── Handlers ──
    const handlePathSelect = useCallback((path: ExportPath) => {
        setSelectedPath(path);
        setIncludeExhibits(DEFAULT_EXHIBITS[path]);
    }, []);

    const isValid = selectedPath && selectedCaseId;

    const handleSubmit = useCallback(async () => {
        if (!isValid || !selectedCaseId) return;
        if (submitGuardRef.current) return; // prevent double-click
        submitGuardRef.current = true;
        setIsSubmitting(true);

        try {
            await onSubmit({
                path: selectedPath,
                caseId: selectedCaseId,
                includeTimeline,
                includeExhibits,
                narrativeDepth,
            });
        } finally {
            setIsSubmitting(false);
            submitGuardRef.current = false;
        }
    }, [isValid, selectedCaseId, selectedPath, includeTimeline, includeExhibits, narrativeDepth, onSubmit]);

    // Resync case selection when the modal opens or the active case changes
    useEffect(() => {
        if (!isOpen) return;
        if (defaultCaseId) {
            setSelectedCaseId(defaultCaseId);
        } else {
            setSelectedCaseId(null);
        }
    }, [isOpen, defaultCaseId]);

    // Auto-select first case if none provided
    useEffect(() => {
        if (selectedCaseId === null && cases && cases.length > 0) {
            const active = cases.find(c => c.status === 'active');
            setSelectedCaseId(active?._id ?? cases[0]._id);
        }
    }, [selectedCaseId, cases]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    >
                        <div
                            className="w-full max-w-[860px] max-h-[90vh] overflow-y-auto rounded-[2rem] border border-white/15 bg-[#0A1128]/95 backdrop-blur-3xl shadow-[0_24px_80px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.1)]"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* ── Header ── */}
                            <div className="flex items-center justify-between p-4 pb-0">
                                <div>
                                    <h2 className="text-2xl font-serif font-bold text-white drop-shadow-sm tracking-tight">
                                        Create Export
                                    </h2>
                                    <p className="text-[14px] font-medium text-white/60 mt-1">
                                        Choose the export type and configuration for a structured document workflow.
                                    </p>
                                </div>
                                <button
                                    onClick={onClose}
                                    aria-label="Close modal"
                                    className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/30 text-white/60 hover:text-white transition-all shrink-0"
                                >
                                    <X size={18} weight="bold" />
                                </button>
                            </div>

                            {/* ── Body: Two Columns ── */}
                            <div className="p-4 grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-8">
                                {/* Left — Export Path Cards */}
                                <div className="space-y-3">
                                    <p className="text-[11px] font-bold tracking-widest uppercase text-[#60A5FA] mb-2">
                                        Export Type
                                    </p>
                                    {EXPORT_PATHS.map(path => {
                                        const Icon = PATH_ICONS[path];
                                        const isSelected = selectedPath === path;
                                        return (
                                            <button
                                                key={path}
                                                type="button"
                                                onClick={() => handlePathSelect(path)}
                                                className={`w-full text-left p-5 rounded-2xl border transition-all group ${
                                                    isSelected
                                                        ? 'bg-[linear-gradient(135deg,#123D7E,#0A1128)] border-[rgba(255,255,255,0.3)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_8px_24px_rgba(0,0,0,0.5)]'
                                                        : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                                                }`}
                                            >
                                                <div className="flex items-start gap-4">
                                                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                                        isSelected
                                                            ? 'bg-[#60A5FA]/20 border border-[#60A5FA]/30'
                                                            : 'bg-white/10 border border-white/10 group-hover:bg-white/15'
                                                    }`}>
                                                        <Icon
                                                            size={22}
                                                            weight={isSelected ? 'fill' : 'regular'}
                                                            className={isSelected ? 'text-[#60A5FA] drop-shadow-[0_2px_8px_rgba(96,165,250,0.6)]' : 'text-white/60'}
                                                        />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <p className={`text-[15px] font-bold ${isSelected ? 'text-white drop-shadow-sm' : 'text-white/80'}`}>
                                                                {EXPORT_PATH_LABELS[path]}
                                                            </p>
                                                            {isSelected && (
                                                                <div className="w-5 h-5 rounded-full bg-[#60A5FA] flex items-center justify-center">
                                                                    <Check size={12} weight="bold" className="text-white" />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <p className={`text-[13px] leading-snug ${isSelected ? 'text-white/70' : 'text-white/50'}`}>
                                                            {EXPORT_PATH_DESCRIPTIONS[path]}
                                                        </p>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Right — Configuration Panel */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Sliders size={16} weight="bold" className="text-[#60A5FA]" />
                                        <p className="text-[11px] font-bold tracking-widest uppercase text-[#60A5FA]">
                                            Configuration
                                        </p>
                                    </div>

                                    {/* Case Selector */}
                                    <div>
                                        <label htmlFor="case-select" className="text-[13px] font-bold text-white/70 mb-2 block">
                                            Case <span className="text-[#E5A84A]">*</span>
                                        </label>
                                        <div className="relative">
                                            <select
                                                id="case-select"
                                                value={selectedCaseId ?? ''}
                                                onChange={e => setSelectedCaseId(e.target.value as Id<'cases'>)}
                                                disabled={lockCaseSelection || !cases}
                                                className="w-full h-12 pl-4 pr-10 rounded-xl bg-white/5 border border-white/15 text-white text-[14px] font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-[#60A5FA]/40 focus:border-[#60A5FA]/50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                {!cases && <option value="">Loading cases…</option>}
                                                {cases?.length === 0 && <option value="">No cases found</option>}
                                                {cases?.map(c => (
                                                    <option key={c._id} value={c._id} className="bg-[#0A1128] text-white">
                                                        {c.title}
                                                    </option>
                                                ))}
                                            </select>
                                            <CaretDown size={14} weight="bold" className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                                        </div>
                                    </div>

                                    {/* Include Timeline Toggle */}
                                    <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <p className="text-[14px] font-bold text-white">Include Timeline</p>
                                                <span className="group relative">
                                                    <Info size={14} className="text-white/30 hover:text-white/60 transition-colors cursor-help" aria-describedby="timeline-tooltip" tabIndex={0} />
                                                    <span id="timeline-tooltip" role="tooltip" className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-[11px] text-white/90 bg-[#1a1f35] border border-white/10 rounded-lg shadow-xl w-52 opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-50">
                                                        Toggle ON to include a chronological summary from your case timeline. Leave OFF for simple document export.
                                                    </span>
                                                </span>
                                            </div>
                                            <p className="text-[12px] text-white/50 mt-0.5">Add chronological event data</p>
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={includeTimeline}
                                            onClick={() => setIncludeTimeline(!includeTimeline)}
                                            className={`relative w-12 h-7 rounded-full transition-colors ${
                                                includeTimeline
                                                    ? 'bg-[#60A5FA] shadow-[0_0_12px_rgba(96,165,250,0.4)]'
                                                    : 'bg-white/20'
                                            }`}
                                        >
                                            <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform ${
                                                includeTimeline ? 'translate-x-[22px]' : 'translate-x-0.5'
                                            }`} />
                                        </button>
                                    </div>

                                    {/* Include Exhibits Toggle */}
                                    <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <p className="text-[14px] font-bold text-white">Include Exhibits</p>
                                                <span className="group relative">
                                                    <Info size={14} className="text-white/30 hover:text-white/60 transition-colors cursor-help" aria-describedby="exhibits-tooltip" tabIndex={0} />
                                                    <span id="exhibits-tooltip" role="tooltip" className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-[11px] text-white/90 bg-[#1a1f35] border border-white/10 rounded-lg shadow-xl w-52 opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-50">
                                                        Toggle ON to attach evidence and exhibits. Best for court filings that reference documents.
                                                    </span>
                                                </span>
                                            </div>
                                            <p className="text-[12px] text-white/50 mt-0.5">Attach evidence references and exhibits</p>
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={includeExhibits}
                                            onClick={() => setIncludeExhibits(!includeExhibits)}
                                            className={`relative w-12 h-7 rounded-full transition-colors ${
                                                includeExhibits
                                                    ? 'bg-[#60A5FA] shadow-[0_0_12px_rgba(96,165,250,0.4)]'
                                                    : 'bg-white/20'
                                            }`}
                                        >
                                            <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform ${
                                                includeExhibits ? 'translate-x-[22px]' : 'translate-x-0.5'
                                            }`} />
                                        </button>
                                    </div>

                                    {/* Narrative Depth Segmented Control */}
                                    <div>
                                        <label className="text-[13px] font-bold text-white/70 mb-2 flex items-center gap-1.5">
                                            Narrative Depth
                                            <span className="group relative">
                                                <Info size={13} className="text-white/30 hover:text-white/60 transition-colors cursor-help" aria-describedby="depth-tooltip" tabIndex={0} />
                                                <span id="depth-tooltip" role="tooltip" className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-[11px] text-white/90 bg-[#1a1f35] border border-white/10 rounded-lg shadow-xl w-52 opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-50">
                                                    Controls AI summary detail. &quot;Light&quot; for quick exports, &quot;Standard&quot; for balanced, &quot;Full&quot; for comprehensive documents.
                                                </span>
                                            </span>
                                        </label>
                                        <div className="flex rounded-xl border border-white/15 overflow-hidden bg-white/5">
                                            {DEPTH_OPTIONS.map(opt => (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    onClick={() => setNarrativeDepth(opt.value)}
                                                    className={`flex-1 py-3 text-[13px] font-bold transition-all ${
                                                        narrativeDepth === opt.value
                                                            ? 'bg-[#60A5FA]/20 text-[#60A5FA] border-b-2 border-[#60A5FA]'
                                                            : 'text-white/50 hover:text-white/70 hover:bg-white/5'
                                                    }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="text-[12px] text-white/40 mt-2">
                                            {narrativeDepth === 'light' && 'Brief overview with essential facts only.'}
                                            {narrativeDepth === 'standard' && 'Balanced coverage with supporting details.'}
                                            {narrativeDepth === 'full' && 'Comprehensive narrative with full evidence chain.'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* ── Footer ── */}
                            <div className="flex items-center justify-between p-4 pt-4 border-t border-white/10">
                                <button
                                    onClick={onClose}
                                    disabled={isSubmitting}
                                    className="px-6 py-3 rounded-xl text-[14px] font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    id="run-assembly-btn"
                                    onClick={handleSubmit}
                                    disabled={!isValid || isSubmitting}
                                    className="flex items-center gap-3 px-8 py-3.5 rounded-xl text-[14px] font-bold uppercase tracking-widest text-white transition-all bg-[linear-gradient(135deg,#123D7E,#0A1128)] border border-[rgba(255,255,255,0.25)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_8px_24px_rgba(0,0,0,0.5)] hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_12px_32px_rgba(0,0,0,0.6)] disabled:opacity-50 disabled:cursor-not-allowed group hover:-translate-y-0.5"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <ArrowsClockwise size={18} weight="bold" className="animate-spin text-[#60A5FA]" />
                                            <span>Assembling…</span>
                                        </>
                                    ) : (
                                        <>
                                            <Lightning size={18} weight="fill" className="text-[#E5A84A] group-hover:scale-110 transition-transform" />
                                            <span>Run Assembly</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
