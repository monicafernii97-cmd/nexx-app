'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BookOpen,
    ArrowsOut,
    ArrowsIn,
    ArrowRight,
    FilePdf,
    Scales,
    SpinnerGap,
} from '@phosphor-icons/react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CaseNarrative {
    title: string;
    overview: string;
    keyFactsSummary: string[];
    timelineSummary: string[];
    supportedPatternsSummary: string[];
    openQuestions: string[];
    narrative: string;
}

interface NarrativeBlockProps {
    /** The AI-generated narrative, or null if not yet generated */
    narrative: CaseNarrative | null;
    /** Whether the narrative is currently being generated */
    isGenerating?: boolean;
    /** Callback to trigger generation */
    onGenerate?: () => void;
    /** Callback to send narrative data to DocuVault */
    onSendToDocuVault?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * NarrativeBlock — The "Story of the Case" viewer.
 *
 * This is the highest-value block on the workspace. It transforms
 * fragmented facts/timeline/patterns into a coherent, neutral narrative.
 *
 * Visual features:
 * - Premium typography (larger text, generous line-height)
 * - 320px max-height cap with gradient fade-out (creates curiosity + depth)
 * - "Expand Full Summary" toggle
 * - Dual CTA: Download Summary PDF / Convert to Court Document
 */
export function NarrativeBlock({
    narrative,
    isGenerating = false,
    onGenerate,
    onSendToDocuVault,
}: NarrativeBlockProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    // ── Empty/Generating State ──
    if (!narrative) {
        return (
            <section className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-[14px] bg-white/5 border border-white/10 flex items-center justify-center">
                        <BookOpen size={18} weight="duotone" className="text-white/30" />
                    </div>
                    <div>
                        <h2 className="text-[18px] font-semibold text-white/90">Case Summary Narrative</h2>
                        <p className="text-[12px] text-white/30 mt-0.5">AI-generated from your workspace data</p>
                    </div>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-[22px] border border-white/5 bg-white/[0.02] overflow-hidden"
                    style={{ padding: '28px' }}
                >
                    {isGenerating ? (
                        <div className="flex flex-col items-center py-8">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                            >
                                <SpinnerGap size={28} weight="bold" className="text-[var(--accent-emerald)]/50" />
                            </motion.div>
                            <p className="text-[13px] text-white/40 mt-4 font-medium">
                                Synthesizing your case data...
                            </p>
                            <p className="text-[11px] text-white/20 mt-1">
                                This may take a few moments
                            </p>
                        </div>
                    ) : (
                        <div className="text-center py-6">
                            <BookOpen size={36} weight="duotone" className="mx-auto text-white/15 mb-4" />
                            <p className="text-[14px] font-semibold text-white/40 mb-2">
                                No summary generated yet
                            </p>
                            <p className="text-[12px] text-white/25 max-w-[360px] mx-auto leading-relaxed mb-6">
                                Generate a structured narrative from your key facts, timeline events, and any clearly supported patterns.
                            </p>
                            {onGenerate && (
                                <button
                                    onClick={onGenerate}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[var(--accent-emerald)]/20 to-[var(--accent-emerald)]/10 border border-[var(--accent-emerald)]/20 text-[12px] font-bold uppercase tracking-wider text-[var(--accent-emerald)] hover:from-[var(--accent-emerald)]/30 hover:to-[var(--accent-emerald)]/15 transition-all cursor-pointer"
                                >
                                    <BookOpen size={14} weight="bold" />
                                    Generate Summary
                                </button>
                            )}
                        </div>
                    )}
                </motion.div>
            </section>
        );
    }

    // ── Narrative Exists ──
    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-[14px] bg-[var(--support-violet)]/10 border border-[var(--support-violet)]/20 flex items-center justify-center">
                        <BookOpen size={18} weight="fill" className="text-[var(--support-violet)]" />
                    </div>
                    <div>
                        <h2 className="text-[18px] font-semibold text-white/90">Case Summary Narrative</h2>
                        <p className="text-[12px] text-white/30 mt-0.5">Based on your documented facts, timeline, and sources</p>
                    </div>
                </div>
            </div>

            <motion.div
                layout
                className="rounded-[22px] border border-white/8 bg-white/[0.03] overflow-hidden"
                style={{ padding: '28px' }}
            >
                {/* Overview */}
                <p className="text-[15px] text-white/70 leading-relaxed font-medium mb-6">
                    {narrative.overview}
                </p>

                {/* Narrative body with gradient fade */}
                <div className="relative">
                    <motion.div
                        animate={{ maxHeight: isExpanded ? 2000 : 320 }}
                        transition={{ duration: 0.4, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        {/* Split narrative into paragraphs */}
                        {narrative.narrative.split('\n\n').map((paragraph, i) => (
                            <p key={i} className="text-[14px] text-white/55 leading-[1.8] mb-4 last:mb-0">
                                {paragraph}
                            </p>
                        ))}
                    </motion.div>

                    {/* Gradient fade overlay — the "depth" effect */}
                    <AnimatePresence>
                        {!isExpanded && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute bottom-0 left-0 right-0 h-[120px] pointer-events-none"
                                style={{
                                    background: 'linear-gradient(to top, rgba(10, 17, 40, 0.95) 0%, rgba(10, 17, 40, 0.6) 40%, transparent 100%)',
                                }}
                            />
                        )}
                    </AnimatePresence>
                </div>

                {/* Expand/Collapse toggle */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-2 mt-4 text-[12px] font-semibold text-[var(--support-violet)] hover:text-[var(--support-violet)]/80 transition-colors cursor-pointer"
                >
                    {isExpanded ? (
                        <>
                            <ArrowsIn size={14} weight="bold" />
                            Collapse Summary
                        </>
                    ) : (
                        <>
                            <ArrowsOut size={14} weight="bold" />
                            Expand Full Summary
                        </>
                    )}
                </button>

                {/* Open questions (if any) */}
                {narrative.openQuestions.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-white/5">
                        <p className="text-[11px] font-bold tracking-wider uppercase text-amber-400/60 mb-2">
                            Open Questions
                        </p>
                        <ul className="space-y-1.5">
                            {narrative.openQuestions.map((q, i) => (
                                <li key={i} className="text-[12px] text-white/35 leading-relaxed flex items-start gap-2">
                                    <span className="text-amber-400/40 mt-0.5">•</span>
                                    {q}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Dual CTAs */}
                <div className="flex items-center gap-3 mt-6 pt-4 border-t border-white/5">
                    <button
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-[12px] font-bold uppercase tracking-wider text-white/50 hover:text-white/70 transition-all cursor-pointer"
                    >
                        <FilePdf size={14} weight="bold" />
                        Download PDF
                    </button>
                    <button
                        onClick={onSendToDocuVault}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-[var(--accent-emerald)]/20 to-[var(--accent-emerald)]/10 border border-[var(--accent-emerald)]/20 text-[12px] font-bold uppercase tracking-wider text-[var(--accent-emerald)] hover:from-[var(--accent-emerald)]/30 hover:to-[var(--accent-emerald)]/15 transition-all cursor-pointer"
                    >
                        <Scales size={14} weight="bold" />
                        Court Document
                        <ArrowRight size={10} />
                    </button>
                </div>
            </motion.div>
        </section>
    );
}
