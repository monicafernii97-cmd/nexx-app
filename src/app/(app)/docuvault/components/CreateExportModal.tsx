'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
    CalendarCheck,
} from '@phosphor-icons/react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Doc, Id } from '@convex/_generated/dataModel';
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
    selectedTimelineIds?: string[];
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

/** Default "Include Exhibit Reference" per path. */
const DEFAULT_EXHIBITS: Record<ExportPath, boolean> = {
    court_document: false,
    case_summary: false,
    exhibit_document: true,
};

type TimelineEventDoc = Doc<'timelineCandidates'>;

type TimelineChoice = {
    id: string;
    label: string;
    description: string;
    eventIds: string[];
};

function formatEventDate(date?: string): string {
    return date?.trim() || 'Undated';
}

function buildTimelineChoices(events: TimelineEventDoc[]): TimelineChoice[] {
    const groups = new Map<string, TimelineEventDoc[]>();

    for (const event of events) {
        const groupId = event.linkedIncidentId
            ? `incident:${event.linkedIncidentId}`
            : `event:${event._id}`;
        groups.set(groupId, [...(groups.get(groupId) ?? []), event]);
    }

    return [...groups.entries()].map(([id, group]) => {
        const sorted = [...group].sort((a, b) =>
            (a.eventDate ?? '').localeCompare(b.eventDate ?? '') || a.title.localeCompare(b.title),
        );
        const first = sorted[0];
        const label = id.startsWith('incident:')
            ? first.title || `Incident timeline (${sorted.length} event${sorted.length === 1 ? '' : 's'})`
            : first.title;
        const status = sorted.some(event => event.status === 'candidate') ? 'Includes pending timeline entries.' : 'Confirmed timeline entries.';

        return {
            id,
            label,
            description: `${formatEventDate(first.eventDate)} - ${sorted.length} event${sorted.length === 1 ? '' : 's'} - ${status}`,
            eventIds: sorted.map(event => event._id),
        };
    });
}

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
    const [showTimelineClarification, setShowTimelineClarification] = useState(false);
    const [timelineSelectionMode, setTimelineSelectionMode] = useState<'entire' | 'selected'>('entire');
    const [selectedTimelineChoiceIds, setSelectedTimelineChoiceIds] = useState<string[]>([]);
    const [timelineError, setTimelineError] = useState<string | null>(null);

    // ── Submit guard ──
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submitGuardRef = useRef(false);

    // ── Data ──
    const cases = useQuery(api.cases.list);
    const timelineEvents = useQuery(
        api.assemblyQueries.getAssemblyEventsByCase,
        selectedCaseId ? { caseId: selectedCaseId } : 'skip',
    );
    const timelineChoices = useMemo(
        () => buildTimelineChoices(timelineEvents ?? []),
        [timelineEvents],
    );

    // ── Handlers ──
    const handlePathSelect = useCallback((path: ExportPath) => {
        setSelectedPath(path);
        setIncludeExhibits(DEFAULT_EXHIBITS[path]);
    }, []);

    const isValid = selectedPath && selectedCaseId;

    const buildConfig = useCallback((selectedTimelineIds?: string[]): ExportConfig => ({
        path: selectedPath,
        caseId: selectedCaseId!,
        includeTimeline,
        includeExhibits,
        selectedTimelineIds,
        narrativeDepth,
    }), [selectedPath, selectedCaseId, includeTimeline, includeExhibits, narrativeDepth]);

    const submitConfig = useCallback(async (config: ExportConfig) => {
        if (submitGuardRef.current) return;
        submitGuardRef.current = true;
        setIsSubmitting(true);

        try {
            await onSubmit(config);
        } finally {
            setIsSubmitting(false);
            submitGuardRef.current = false;
        }
    }, [onSubmit]);

    const handleSubmit = useCallback(async () => {
        if (!isValid || !selectedCaseId) return;
        setTimelineError(null);

        if (includeTimeline) {
            if (timelineEvents === undefined) {
                setTimelineError('Loading timeline data. Please try again in a moment.');
                return;
            }

            const allTimelineIds = timelineEvents.map(event => event._id);
            if (timelineEvents.length <= 1 || timelineChoices.length <= 1) {
                await submitConfig(buildConfig(allTimelineIds));
                return;
            }

            setTimelineSelectionMode('entire');
            setSelectedTimelineChoiceIds([]);
            setShowTimelineClarification(true);
            return;
        }

        await submitConfig(buildConfig([]));
    }, [isValid, selectedCaseId, includeTimeline, timelineEvents, timelineChoices.length, submitConfig, buildConfig]);

    const handleTimelineChoiceToggle = useCallback((choiceId: string) => {
        setSelectedTimelineChoiceIds(prev =>
            prev.includes(choiceId)
                ? prev.filter(id => id !== choiceId)
                : [...prev, choiceId],
        );
    }, []);

    const handleTimelineClarificationContinue = useCallback(async () => {
        setTimelineError(null);
        const selectedIds = timelineSelectionMode === 'entire'
            ? (timelineEvents ?? []).map(event => event._id)
            : timelineChoices
                .filter(choice => selectedTimelineChoiceIds.includes(choice.id))
                .flatMap(choice => choice.eventIds);

        if (timelineSelectionMode === 'selected' && selectedIds.length === 0) {
            setTimelineError('Select at least one incident timeline, or choose the entire timeline.');
            return;
        }

        setShowTimelineClarification(false);
        await submitConfig(buildConfig(selectedIds));
    }, [timelineSelectionMode, timelineEvents, timelineChoices, selectedTimelineChoiceIds, submitConfig, buildConfig]);

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
                                    {timelineError && !showTimelineClarification && (
                                        <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[12px]">
                                            {timelineError}
                                        </div>
                                    )}

                                    {/* Include Exhibit Reference Toggle */}
                                    <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <p className="text-[14px] font-bold text-white">Include Exhibit Reference</p>
                                                <span className="group relative">
                                                    <Info size={14} className="text-white/30 hover:text-white/60 transition-colors cursor-help" aria-describedby="exhibits-tooltip" tabIndex={0} />
                                                    <span id="exhibits-tooltip" role="tooltip" className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-[11px] text-white/90 bg-[#1a1f35] border border-white/10 rounded-lg shadow-xl w-52 opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-50">
                                                        Toggle ON to include exhibit references. Best for court filings that reference documents.
                                                    </span>
                                                </span>
                                            </div>
                                            <p className="text-[12px] text-white/50 mt-0.5">Include exhibit references</p>
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
                            <div className="flex items-center justify-between p-4 border-t border-white/10">
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
                    {showTimelineClarification && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 16 }}
                            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
                        >
                            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
                            <div className="relative w-full max-w-[620px] rounded-[1.5rem] border border-white/15 bg-[#0A1128]/95 shadow-[0_24px_80px_rgba(0,0,0,0.75)] overflow-hidden">
                                <div className="p-5 border-b border-white/10 flex items-start gap-4">
                                    <div className="w-11 h-11 rounded-xl bg-[#60A5FA]/15 border border-[#60A5FA]/25 flex items-center justify-center shrink-0">
                                        <CalendarCheck size={22} weight="fill" className="text-[#60A5FA]" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-serif font-bold text-white">Which timeline should be included?</h3>
                                        <p className="text-[13px] text-white/55 mt-1">
                                            This case has multiple timeline groups. Choose the full case timeline or only the incident timeline(s) relevant to this export.
                                        </p>
                                    </div>
                                </div>

                                <div className="p-5 space-y-3 max-h-[56vh] overflow-y-auto">
                                    <button
                                        type="button"
                                        onClick={() => setTimelineSelectionMode('entire')}
                                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                                            timelineSelectionMode === 'entire'
                                                ? 'bg-[#60A5FA]/15 border-[#60A5FA]/40'
                                                : 'bg-white/5 border-white/10 hover:bg-white/10'
                                        }`}
                                    >
                                        <p className="text-[14px] font-bold text-white">Entire case timeline</p>
                                        <p className="text-[12px] text-white/50 mt-1">
                                            Include all {timelineEvents?.length ?? 0} timeline event{(timelineEvents?.length ?? 0) === 1 ? '' : 's'} for this case.
                                        </p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setTimelineSelectionMode('selected')}
                                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                                            timelineSelectionMode === 'selected'
                                                ? 'bg-[#60A5FA]/15 border-[#60A5FA]/40'
                                                : 'bg-white/5 border-white/10 hover:bg-white/10'
                                        }`}
                                    >
                                        <p className="text-[14px] font-bold text-white">Specific incident timeline(s)</p>
                                        <p className="text-[12px] text-white/50 mt-1">
                                            Choose one or more incident/event groups below.
                                        </p>
                                    </button>

                                    {timelineSelectionMode === 'selected' && (
                                        <div className="space-y-2 pt-1">
                                            {timelineChoices.map(choice => {
                                                const checked = selectedTimelineChoiceIds.includes(choice.id);
                                                return (
                                                    <button
                                                        key={choice.id}
                                                        type="button"
                                                        onClick={() => handleTimelineChoiceToggle(choice.id)}
                                                        className={`w-full text-left p-3 rounded-xl border flex items-start gap-3 transition-all ${
                                                            checked
                                                                ? 'bg-emerald-500/10 border-emerald-400/30'
                                                                : 'bg-black/20 border-white/10 hover:bg-white/5'
                                                        }`}
                                                    >
                                                        <span className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                                            checked ? 'bg-emerald-400 border-emerald-400' : 'border-white/30'
                                                        }`}>
                                                            {checked && <Check size={10} weight="bold" className="text-[#0A1128]" />}
                                                        </span>
                                                        <span>
                                                            <span className="block text-[13px] font-bold text-white">{choice.label}</span>
                                                            <span className="block text-[11px] text-white/45 mt-0.5">{choice.description}</span>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {timelineError && (
                                        <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[12px]">
                                            {timelineError}
                                        </div>
                                    )}
                                </div>

                                <div className="p-5 border-t border-white/10 flex items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowTimelineClarification(false);
                                            setTimelineError(null);
                                        }}
                                        disabled={isSubmitting}
                                        className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white/55 hover:text-white hover:bg-white/5 transition-all"
                                    >
                                        Back
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleTimelineClarificationContinue}
                                        disabled={isSubmitting}
                                        className="px-6 py-2.5 rounded-xl text-[13px] font-bold text-white bg-[#123D7E] border border-white/20 hover:bg-[#1A4B9B] transition-all disabled:opacity-50"
                                    >
                                        {isSubmitting ? 'Assembling...' : 'Continue'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </>
            )}
        </AnimatePresence>
    );
}
