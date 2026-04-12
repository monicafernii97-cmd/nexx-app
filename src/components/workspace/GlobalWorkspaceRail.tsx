'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    CheckCircle,
    WarningCircle,
    Clock,
    Lightning,
    FileText,
    CalendarCheck,
    ChartBar,
    ArrowRight,
    CaretRight,
    CaretLeft,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useWorkspace } from '@/lib/workspace-context';
import { useState } from 'react';

// ---------------------------------------------------------------------------
// Readiness scoring — how "court-ready" is the user's workspace?
// ---------------------------------------------------------------------------

type ReadinessLevel = 'strong' | 'partial' | 'missing';

interface ReadinessItem {
    label: string;
    level: ReadinessLevel;
    detail: string;
    icon: typeof CheckCircle;
}

function getReadinessLevel(count: number, threshold: number): ReadinessLevel {
    if (count >= threshold) return 'strong';
    if (count > 0) return 'partial';
    return 'missing';
}

const LEVEL_STYLES: Record<ReadinessLevel, { dot: string; text: string; bg: string }> = {
    strong: {
        dot: 'bg-[var(--accent-emerald)]',
        text: 'text-[var(--accent-emerald)]',
        bg: 'bg-[var(--accent-emerald)]/10 border-[var(--accent-emerald)]/20',
    },
    partial: {
        dot: 'bg-amber-400',
        text: 'text-amber-400',
        bg: 'bg-amber-400/10 border-amber-400/20',
    },
    missing: {
        dot: 'bg-white/20',
        text: 'text-white/30',
        bg: 'bg-white/5 border-white/10',
    },
};

// ---------------------------------------------------------------------------
// Suggested Actions — contextual CTAs based on workspace state
// ---------------------------------------------------------------------------

interface SuggestedAction {
    label: string;
    href: string;
    priority: 'high' | 'medium' | 'low';
}

/**
 * GlobalWorkspaceRail — The "Insights Rail" (360px sticky right panel).
 *
 * Replaces the old Pinned/Points tab switcher with an outcome-oriented
 * audit panel: Report Readiness, Source Health, and Suggested Actions.
 *
 * Visual philosophy: GUIDANCE — not noise. Just readiness, gaps, next steps.
 */
export function GlobalWorkspaceRail() {
    const { counts, pins, memory, timeline } = useWorkspace();
    const [isExpanded, setIsExpanded] = useState(true);

    // ── Readiness scoring ──
    const readiness: ReadinessItem[] = useMemo(() => [
        {
            label: 'Key Facts',
            level: getReadinessLevel(counts.keyFacts, 3),
            detail: counts.keyFacts === 0 ? 'None captured yet' : `${counts.keyFacts} documented`,
            icon: FileText,
        },
        {
            label: 'Timeline',
            level: getReadinessLevel(counts.confirmedTimeline, 3),
            detail: counts.confirmedTimeline === 0
                ? 'No confirmed events'
                : `${counts.confirmedTimeline} confirmed`,
            icon: CalendarCheck,
        },
        {
            label: 'Patterns',
            level: getReadinessLevel(0, 1), // Will be dynamic once pattern detection is built
            detail: 'Requires 3+ repeated events',
            icon: ChartBar,
        },
    ], [counts]);

    // ── Source Health ──
    const totalSources = useMemo(() => {
        const pinSources = pins?.filter(p => p.sourceMessageId).length ?? 0;
        const memorySources = memory?.filter(m => m.sourceMessageId).length ?? 0;
        const timelineSources = timeline?.filter(t => t.sourceMessageId).length ?? 0;
        return pinSources + memorySources + timelineSources;
    }, [pins, memory, timeline]);

    const totalItems = counts.pins + counts.memory + counts.timeline;
    const unlinkedItems = totalItems - totalSources;

    // ── Suggested Actions ──
    const actions: SuggestedAction[] = useMemo(() => {
        const result: SuggestedAction[] = [];

        if (counts.keyFacts === 0) {
            result.push({ label: 'Capture key facts from chat', href: '/chat', priority: 'high' });
        }
        if (counts.timeline === 0) {
            result.push({ label: 'Add timeline events', href: '/chat/timeline', priority: 'high' });
        } else if (counts.confirmedTimeline < counts.timeline) {
            result.push({ label: 'Review unconfirmed events', href: '/chat/timeline', priority: 'medium' });
        }
        if (counts.risks === 0 && counts.keyFacts > 0) {
            result.push({ label: 'Identify risk concerns', href: '/chat', priority: 'medium' });
        }
        if (result.length === 0) {
            result.push({ label: 'Generate your case summary', href: '/chat/overview', priority: 'low' });
        }

        return result.slice(0, 3); // Max 3 actions
    }, [counts]);

    // ── Collapsed State ──
    if (!isExpanded) {
        return (
            <motion.div
                initial={false}
                animate={{ width: 64 }}
                className="h-[calc(100dvh-3rem)] sticky top-6 flex flex-col items-center py-6 gap-6 glass-ethereal rounded-[2rem] border border-white/10 z-30"
            >
                <button
                    onClick={() => setIsExpanded(true)}
                    className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all group cursor-pointer"
                    aria-label="Expand insights rail"
                    title="Expand Insights"
                >
                    <CaretLeft size={20} weight="bold" className="group-hover:-translate-x-0.5 transition-transform" />
                </button>

                {/* Readiness summary icons */}
                <div className="flex flex-col gap-3 mt-4">
                    {readiness.map((item) => (
                        <div
                            key={item.label}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center border ${LEVEL_STYLES[item.level].bg}`}
                            title={`${item.label}: ${item.detail}`}
                        >
                            <item.icon size={18} weight="fill" className={LEVEL_STYLES[item.level].text} />
                        </div>
                    ))}
                </div>
            </motion.div>
        );
    }

    // ── Expanded State ──
    return (
        <motion.aside
            initial={false}
            animate={{ width: 360 }}
            className="h-[calc(100dvh-3rem)] sticky top-6 flex flex-col glass-ethereal rounded-[2rem] border border-white/10 overflow-hidden z-30 shadow-2xl"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
                <h2 className="text-sm font-bold tracking-[0.1em] uppercase text-white/50">
                    Insights
                </h2>
                <button
                    onClick={() => setIsExpanded(false)}
                    className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white transition-all cursor-pointer"
                    aria-label="Collapse insights rail"
                >
                    <CaretRight size={18} weight="bold" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-6 no-scrollbar">

                {/* ── Section 1: Report Readiness ── */}
                <section>
                    <div className="flex items-center gap-2 mb-3">
                        <ChartBar size={14} weight="fill" className="text-white/30" />
                        <h3 className="text-[11px] font-bold tracking-[0.12em] uppercase text-white/40">
                            Report Readiness
                        </h3>
                    </div>

                    <div className="space-y-2">
                        {readiness.map((item) => {
                            const styles = LEVEL_STYLES[item.level];
                            return (
                                <div
                                    key={item.label}
                                    className={`flex items-center gap-3 px-3.5 py-3 rounded-[14px] border transition-all ${styles.bg}`}
                                >
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-semibold text-white/80">{item.label}</p>
                                        <p className={`text-[11px] font-medium mt-0.5 ${styles.text}`}>{item.detail}</p>
                                    </div>
                                    {item.level === 'strong' && (
                                        <CheckCircle size={16} weight="fill" className="text-[var(--accent-emerald)] flex-shrink-0" />
                                    )}
                                    {item.level === 'partial' && (
                                        <WarningCircle size={16} weight="fill" className="text-amber-400 flex-shrink-0" />
                                    )}
                                    {item.level === 'missing' && (
                                        <Clock size={16} weight="regular" className="text-white/20 flex-shrink-0" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* ── Section 2: Source Health ── */}
                <section>
                    <div className="flex items-center gap-2 mb-3">
                        <FileText size={14} weight="fill" className="text-white/30" />
                        <h3 className="text-[11px] font-bold tracking-[0.12em] uppercase text-white/40">
                            Source Health
                        </h3>
                    </div>

                    <div className="px-3.5 py-3 rounded-[14px] border border-white/10 bg-white/[0.03]">
                        <div className="flex items-baseline justify-between mb-2">
                            <span className="text-[22px] font-bold text-white">{totalSources}</span>
                            <span className="text-[11px] font-medium text-white/40">linked sources</span>
                        </div>
                        {unlinkedItems > 0 && (
                            <p className="text-[11px] font-medium text-amber-400/70">
                                {unlinkedItems} item{unlinkedItems !== 1 ? 's' : ''} without source link
                            </p>
                        )}
                        {unlinkedItems === 0 && totalItems > 0 && (
                            <p className="text-[11px] font-medium text-[var(--accent-emerald)]/70">
                                All items fully source-backed ✓
                            </p>
                        )}
                    </div>
                </section>

                {/* ── Section 3: Suggested Actions ── */}
                <section>
                    <div className="flex items-center gap-2 mb-3">
                        <Lightning size={14} weight="fill" className="text-white/30" />
                        <h3 className="text-[11px] font-bold tracking-[0.12em] uppercase text-white/40">
                            Next Steps
                        </h3>
                    </div>

                    <div className="space-y-2">
                        {actions.map((action, i) => (
                            <Link
                                key={i}
                                href={action.href}
                                className="flex items-center gap-3 px-3.5 py-3 rounded-[14px] border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/10 transition-all group no-underline"
                            >
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                    action.priority === 'high' ? 'bg-amber-400' :
                                    action.priority === 'medium' ? 'bg-[var(--accent-icy)]' :
                                    'bg-white/20'
                                }`} />
                                <span className="text-[12px] font-medium text-white/60 group-hover:text-white/80 transition-colors flex-1">
                                    {action.label}
                                </span>
                                <ArrowRight size={12} className="text-white/20 group-hover:text-white/40 transition-colors" />
                            </Link>
                        ))}
                    </div>
                </section>
            </div>

            {/* Footer CTA */}
            <div className="px-5 py-4 border-t border-white/5 bg-white/[0.02]">
                <Link
                    href="/chat/overview"
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-[var(--accent-emerald)]/20 to-[var(--accent-emerald)]/10 border border-[var(--accent-emerald)]/20 text-[12px] font-bold uppercase tracking-widest text-[var(--accent-emerald)] hover:from-[var(--accent-emerald)]/30 hover:to-[var(--accent-emerald)]/15 transition-all no-underline"
                >
                    <FileText size={14} weight="bold" />
                    Case Overview
                </Link>
            </div>
        </motion.aside>
    );
}
