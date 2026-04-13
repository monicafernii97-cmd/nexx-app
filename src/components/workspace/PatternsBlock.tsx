'use client';

import { motion } from 'framer-motion';
import {
    ChartBar,
    CheckCircle,
    ShieldCheck,
    CalendarBlank,
    Info,
} from '@phosphor-icons/react';
import type { DetectedPattern } from '@/lib/nexx/premiumAnalytics';
import { getConfidenceLabel } from '@/lib/nexx/premiumAnalytics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatternsBlockProps {
    /** Patterns that have passed hard gates and confidence scoring */
    patterns: DetectedPattern[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * PatternsBlock — Displays evidence-based behavioral patterns.
 *
 * Design philosophy:
 * - This section must visually communicate RESTRAINT
 * - Patterns are EARNED, not inferred
 * - If threshold not met → show educational "No patterns detected" state
 * - Titles must describe observable behavior, never intent/personality
 *
 * Labels:
 * - "Clearly Supported" (score 8-10) — shown confidently
 * - "Supported" (score 5-7) — shown with restrained language
 */
export function PatternsBlock({ patterns }: PatternsBlockProps) {
    // Filter to only eligible patterns (redundant safety — caller should pre-filter)
    const visiblePatterns = patterns.filter(p => p.confidence !== 'low');

    // ── Empty state: Educational, trust-building ──
    if (visiblePatterns.length === 0) {
        return (
            <section className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-[14px] bg-white/5 border border-white/10 flex items-center justify-center">
                        <ChartBar size={18} weight="duotone" className="text-white/30" />
                    </div>
                    <div>
                        <h2 className="text-[18px] font-semibold text-white/90">Observed Patterns</h2>
                        <p className="text-[12px] text-white/30 mt-0.5">Evidence-based behavioral analysis</p>
                    </div>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="px-6 py-8 rounded-[20px] border border-white/5 bg-white/[0.02] text-center"
                >
                    <ShieldCheck size={36} weight="duotone" className="mx-auto text-white/15 mb-4" />
                    <p className="text-[14px] font-semibold text-white/40">No Patterns Detected</p>
                    <p className="text-[12px] text-white/25 mt-2 max-w-[320px] mx-auto leading-relaxed">
                        We only show patterns when repeated, source-backed behavior is clearly supported across multiple events.
                    </p>
                </motion.div>
            </section>
        );
    }

    // ── Patterns exist ──
    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-[14px] bg-[var(--accent-emerald)]/10 border border-[var(--accent-emerald)]/20 flex items-center justify-center">
                        <ChartBar size={18} weight="fill" className="text-[var(--accent-emerald)]" />
                    </div>
                    <div>
                        <h2 className="text-[18px] font-semibold text-white/90">Observed Patterns</h2>
                        <p className="text-[12px] text-white/30 mt-0.5">
                            Shown only when repeated, source-backed behavior is clearly supported across multiple events.
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {visiblePatterns.map((pattern, index) => (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.08 }}
                        className="rounded-[18px] border border-white/8 bg-white/[0.03] overflow-hidden"
                        style={{ padding: '20px' }}
                    >
                        {/* Header: Title + Confidence Badge */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <h3 className="text-[15px] font-semibold text-white/85 leading-snug">
                                {pattern.title}
                            </h3>
                            <span className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                pattern.confidence === 'high'
                                    ? 'bg-[var(--accent-emerald)]/15 text-[var(--accent-emerald)] border border-[var(--accent-emerald)]/20'
                                    : 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                            }`}>
                                <CheckCircle size={10} weight="fill" />
                                {getConfidenceLabel(pattern.confidence)}
                            </span>
                        </div>

                        {/* Summary */}
                        <p className="text-[13px] text-white/50 leading-relaxed mb-4">
                            {pattern.summary}
                        </p>

                        {/* Supporting instances */}
                        <div className="space-y-2">
                            {pattern.supportingEvents.slice(0, 5).map((event, i) => (
                                <div key={i} className="flex items-start gap-3 pl-3 py-1.5 border-l-2 border-white/8">
                                    <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                                        <CalendarBlank size={11} className="text-white/25" />
                                        <span className="text-[11px] font-medium text-white/30 tabular-nums w-[70px]">
                                            {event.date}
                                        </span>
                                    </div>
                                    <p className="text-[12px] text-white/45 leading-relaxed">
                                        {event.description}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Source-backed note */}
                        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
                            <Info size={12} className="text-white/20" />
                            <p className="text-[10px] text-white/20 font-medium">
                                Based on {pattern.supportingEvents.length} documented events across multiple dates
                            </p>
                        </div>
                    </motion.div>
                ))}
            </div>
        </section>
    );
}
