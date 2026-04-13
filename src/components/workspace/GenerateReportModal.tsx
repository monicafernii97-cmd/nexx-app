'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    FilePdf,
    Scales,
    Files,
    TextAlignLeft,
    ListBullets,
    BookOpen,
    ChartBar,
    ShieldCheck,
    ArrowRight,
    SpinnerGap,
} from '@phosphor-icons/react';

// ---------------------------------------------------------------------------
// Types — imported from shared module & re-exported for consumers
// ---------------------------------------------------------------------------

import type { OutputType, ToneType, PatternHandling } from '@/lib/workspace-types';
export type { OutputType, ToneType, PatternHandling } from '@/lib/workspace-types';

interface GenerateReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (options: {
        outputType: OutputType;
        tone: ToneType;
        patternHandling: PatternHandling;
    }) => void;
    isGenerating?: boolean;
    /** Number of items in the workspace to display in preview */
    itemCounts: {
        facts: number;
        timeline: number;
        patterns: number;
        pins: number;
    };
}

// ---------------------------------------------------------------------------
// Option configs
// ---------------------------------------------------------------------------

const OUTPUT_OPTIONS: { id: OutputType; label: string; description: string; icon: typeof FilePdf }[] = [
    { id: 'summary', label: 'Case Summary PDF', description: 'Personal strategy briefing', icon: FilePdf },
    { id: 'court_document', label: 'Court Document Draft', description: 'Pre-fill a court filing', icon: Scales },
    { id: 'both', label: 'Both', description: 'Summary + court-ready draft', icon: Files },
];

const TONE_OPTIONS: { id: ToneType; label: string; description: string }[] = [
    { id: 'neutral_concise', label: 'Neutral & Concise', description: 'Fact-forward, minimal commentary' },
    { id: 'detailed_organized', label: 'Detailed & Organized', description: 'Structured sections with context' },
    { id: 'attorney_ready', label: 'Attorney-Ready', description: 'Formatted for legal review' },
];

const PATTERN_OPTIONS: { id: PatternHandling; label: string; icon: typeof ChartBar }[] = [
    { id: 'include_supported', label: 'Include clearly supported patterns', icon: ChartBar },
    { id: 'exclude', label: 'Exclude patterns entirely', icon: ShieldCheck },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * GenerateReportModal — The bridge between Workspace and DocuVault.
 *
 * Flow:
 * 1. User clicks "Generate Report" in sidebar or workspace
 * 2. Modal opens with 3 option groups: Output Type, Tone, Pattern Handling
 * 3. On "Build Report" → generates narrative → redirects to DocuVault (prefilled)
 *
 * Visual: 720px width, 28px padding, 24px radius.
 */
export function GenerateReportModal({
    isOpen,
    onClose,
    onGenerate,
    isGenerating = false,
    itemCounts,
}: GenerateReportModalProps) {
    const [outputType, setOutputType] = useState<OutputType>('summary');
    const [tone, setTone] = useState<ToneType>('neutral_concise');
    const [patternHandling, setPatternHandling] = useState<PatternHandling>('include_supported');
    const modalRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    // Escape to close + focus management
    useEffect(() => {
        if (!isOpen) return;
        previousFocusRef.current = document.activeElement as HTMLElement;
        const timer = setTimeout(() => modalRef.current?.focus(), 50);

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            clearTimeout(timer);
            previousFocusRef.current?.focus();
        };
    }, [isOpen, onClose]);

    const handleGenerate = useCallback(() => {
        onGenerate({ outputType, tone, patternHandling });
    }, [onGenerate, outputType, tone, patternHandling]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none"
                    >
                        <div
                            ref={modalRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="generate-report-title"
                            tabIndex={-1}
                            className="w-full max-w-[720px] pointer-events-auto rounded-[24px] border border-white/10 shadow-2xl overflow-hidden outline-none"
                            style={{
                                background: 'linear-gradient(135deg, rgba(10, 17, 40, 0.98), rgba(10, 17, 40, 0.95))',
                                backdropFilter: 'blur(40px)',
                                padding: '28px',
                            }}
                        >
                            {/* Header */}
                            <div className="flex items-start justify-between mb-6">
                                <div>
                                    <h2 id="generate-report-title" className="text-[22px] font-bold text-white">Generate Report</h2>
                                    <p className="text-[13px] text-white/40 mt-1">
                                        Create a structured summary from your saved facts, timeline, and source-backed events.
                                    </p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                                    aria-label="Close modal"
                                >
                                    <X size={18} weight="bold" />
                                </button>
                            </div>

                            {/* Data preview */}
                            <div className="flex items-center gap-4 px-4 py-3 rounded-[14px] border border-white/5 bg-white/[0.02] mb-6">
                                <span className="text-[11px] font-bold tracking-wider uppercase text-white/30">
                                    Includes:
                                </span>
                                {[
                                    { label: 'Facts', count: itemCounts.facts, icon: BookOpen },
                                    { label: 'Timeline', count: itemCounts.timeline, icon: ListBullets },
                                    { label: 'Patterns', count: itemCounts.patterns, icon: ChartBar },
                                    { label: 'Pins', count: itemCounts.pins, icon: TextAlignLeft },
                                ].map(({ label, count, icon: Icon }) => (
                                    <div key={label} className="flex items-center gap-1.5 text-white/40">
                                        <Icon size={12} weight="bold" />
                                        <span className="text-[11px] font-semibold">{count} {label}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Option Group 1: Output Type */}
                            <div className="mb-5">
                                <label className="text-[11px] font-bold tracking-[0.12em] uppercase text-white/40 mb-2 block">
                                    Output Type
                                </label>
                                <div className="grid grid-cols-3 gap-3">
                                    {OUTPUT_OPTIONS.map((opt) => {
                                        const isActive = outputType === opt.id;
                                        return (
                                            <button
                                                key={opt.id}
                                                onClick={() => setOutputType(opt.id)}
                                                className={`relative p-4 rounded-[14px] border text-left transition-all cursor-pointer ${
                                                    isActive
                                                        ? 'bg-[var(--accent-emerald)]/10 border-[var(--accent-emerald)]/25'
                                                        : 'bg-white/[0.02] border-white/8 hover:border-white/15 hover:bg-white/[0.04]'
                                                }`}
                                            >
                                                <opt.icon size={20} weight={isActive ? 'fill' : 'regular'} className={isActive ? 'text-[var(--accent-emerald)]' : 'text-white/30'} />
                                                <p className={`text-[13px] font-semibold mt-2 ${isActive ? 'text-white' : 'text-white/60'}`}>
                                                    {opt.label}
                                                </p>
                                                <p className="text-[11px] text-white/30 mt-0.5">{opt.description}</p>
                                                {isActive && (
                                                    <motion.div
                                                        layoutId="output-indicator"
                                                        className="absolute top-3 right-3 w-2 h-2 rounded-full bg-[var(--accent-emerald)]"
                                                    />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Option Group 2: Tone */}
                            <div className="mb-5">
                                <label className="text-[11px] font-bold tracking-[0.12em] uppercase text-white/40 mb-2 block">
                                    Tone
                                </label>
                                <div className="space-y-2">
                                    {TONE_OPTIONS.map((opt) => {
                                        const isActive = tone === opt.id;
                                        return (
                                            <button
                                                key={opt.id}
                                                onClick={() => setTone(opt.id)}
                                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-[12px] border text-left transition-all cursor-pointer ${
                                                    isActive
                                                        ? 'bg-white/8 border-white/15'
                                                        : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                                                }`}
                                            >
                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                                    isActive ? 'border-[var(--accent-emerald)]' : 'border-white/20'
                                                }`}>
                                                    {isActive && (
                                                        <motion.div
                                                            layoutId="tone-dot"
                                                            className="w-2 h-2 rounded-full bg-[var(--accent-emerald)]"
                                                        />
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <p className={`text-[13px] font-semibold ${isActive ? 'text-white' : 'text-white/60'}`}>
                                                        {opt.label}
                                                    </p>
                                                    <p className="text-[11px] text-white/30">{opt.description}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Option Group 3: Pattern Handling */}
                            <div className="mb-6">
                                <label className="text-[11px] font-bold tracking-[0.12em] uppercase text-white/40 mb-2 block">
                                    Pattern Handling
                                </label>
                                <div className="flex gap-3">
                                    {PATTERN_OPTIONS.map((opt) => {
                                        const isActive = patternHandling === opt.id;
                                        return (
                                            <button
                                                key={opt.id}
                                                onClick={() => setPatternHandling(opt.id)}
                                                className={`flex-1 flex items-center gap-2.5 px-4 py-3 rounded-[12px] border text-left transition-all cursor-pointer ${
                                                    isActive
                                                        ? 'bg-white/8 border-white/15'
                                                        : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                                                }`}
                                            >
                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                                    isActive ? 'border-[var(--accent-emerald)]' : 'border-white/20'
                                                }`}>
                                                    {isActive && (
                                                        <motion.div className="w-2 h-2 rounded-full bg-[var(--accent-emerald)]" />
                                                    )}
                                                </div>
                                                <opt.icon size={14} className={isActive ? 'text-white/60' : 'text-white/25'} />
                                                <span className={`text-[12px] font-medium ${isActive ? 'text-white/80' : 'text-white/40'}`}>
                                                    {opt.label}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-end gap-3">
                                <button
                                    onClick={onClose}
                                    className="px-5 py-2.5 rounded-xl border border-white/10 text-[13px] font-semibold text-white/40 hover:text-white/60 hover:bg-white/5 transition-all cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleGenerate}
                                    disabled={isGenerating}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[var(--accent-emerald)] to-[var(--accent-emerald)]/80 text-[13px] font-bold text-white shadow-lg shadow-[var(--accent-emerald)]/20 hover:shadow-[var(--accent-emerald)]/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isGenerating ? (
                                        <>
                                            <SpinnerGap size={14} weight="bold" className="animate-spin" />
                                            Building...
                                        </>
                                    ) : (
                                        <>
                                            Build Report
                                            <ArrowRight size={14} weight="bold" />
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
