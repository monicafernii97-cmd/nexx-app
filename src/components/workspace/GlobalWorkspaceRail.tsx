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
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';

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
    const { counts, pins, memory, timeline, activeCaseId } = useWorkspace();
    const [isExpanded, setIsExpanded] = useState(true);

    // ── Detected patterns from Convex ──
    const detectedPatterns = useQuery(
        api.detectedPatterns.listByCase,
        activeCaseId ? { caseId: activeCaseId } : 'skip'
    );
    const patternCount = detectedPatterns?.length ?? 0;

    // True when at least one data query is still loading.
    // Prevents showing "missing" readiness for data that simply hasn't arrived yet.
    const isLoading = pins === undefined || memory === undefined || timeline === undefined;

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
            level: getReadinessLevel(patternCount, 1),
            detail: patternCount === 0
                ? 'Requires 3+ repeated events'
                : `${patternCount} detected`,
            icon: ChartBar,
        },
    ], [counts, patternCount]);

    // ── Source Health ──
    const totalSources = useMemo(() => {
        const pinSources = pins?.filter(p => p.sourceMessageId || p.sourceConversationId).length ?? 0;
        const memorySources = memory?.filter(m => m.sourceMessageId || m.sourceConversationId).length ?? 0;
        const timelineSources = timeline?.filter(t => t.sourceMessageId || t.sourceConversationId).length ?? 0;
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
            animate={{ width: 310 }}
            className="h-[calc(100dvh-3rem)] sticky top-6 flex flex-col hyper-glass rounded-[2rem] overflow-hidden z-30 glow-slate"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-8 pt-8 pb-4">
                <h2 className="text-[10px] font-bold tracking-[0.3em] uppercase text-indigo-400 opacity-60">
                    Intelligence
                </h2>
                <button
                    onClick={() => setIsExpanded(false)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 border border-white/10 text-white/30 hover:text-white transition-all cursor-pointer"
                    aria-label="Collapse insights rail"
                >
                    <CaretRight size={16} weight="bold" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-8 no-scrollbar">

                {isLoading ? (
                    /* Skeleton placeholders while workspace queries resolve */
                    <div className="space-y-4 pt-2">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-16 rounded-2xl bg-white/5 animate-pulse" />
                        ))}
                    </div>
                ) : (
                <>
                {/* ── Section 1: Report Readiness ── */}
                <section>
                    <div className="flex items-center gap-2 mb-4 px-2">
                        <ChartBar size={14} weight="light" className="text-white/20" />
                        <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/30">
                            Case Readiness
                        </h3>
                    </div>

                    <div className="space-y-3">
                        {readiness.map((item) => {
                            const styles = LEVEL_STYLES[item.level];
                            return (
                                <div
                                    key={item.label}
                                    className={`flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all hover:bg-white/[0.04] ${styles.bg}`}
                                >
                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${styles.dot} shadow-[0_0_8px_rgba(255,255,255,0.2)]`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-bold text-white tracking-tight">{item.label}</p>
                                        <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${styles.text}`}>{item.detail}</p>
                                    </div>
                                    {item.level === 'strong' && (
                                        <CheckCircle size={18} weight="light" className="text-emerald-400 flex-shrink-0" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* ── Section 2: Source Health ── */}
                <section>
                    <div className="flex items-center gap-2 mb-4 px-2">
                        <FileText size={14} weight="light" className="text-white/20" />
                        <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/30">
                            Evidence Health
                        </h3>
                    </div>

                    <div className="px-5 py-5 rounded-2xl border border-white/5 bg-white/[0.02] flex flex-col gap-1">
                        <div className="flex items-baseline justify-between mb-1">
                            <span className="text-2xl font-serif text-white">{totalSources}</span>
                            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Linked</span>
                        </div>
                        {unlinkedItems > 0 && (
                            <p className="text-[10px] font-bold text-amber-400/60 uppercase tracking-widest leading-relaxed">
                                {unlinkedItems} Items Unverified
                            </p>
                        )}
                        {unlinkedItems === 0 && totalItems > 0 && (
                            <p className="text-[10px] font-bold text-emerald-400/60 uppercase tracking-widest">
                                Full Verification Trace ✓
                            </p>
                        )}
                    </div>
                </section>

                {/* ── Section 3: Suggested Actions ── */}
                <section>
                    <div className="flex items-center gap-2 mb-4 px-2">
                        <Lightning size={14} weight="light" className="text-white/20" />
                        <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/30">
                            Strategic Actions
                        </h3>
                    </div>

                    <div className="space-y-2">
                        {actions.map((action, i) => (
                            <Link
                                key={i}
                                href={action.href}
                                className="flex items-center gap-4 px-5 py-4 rounded-2xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.05] hover:border-indigo-500/30 transition-all group no-underline"
                            >
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                    action.priority === 'high' ? 'bg-indigo-400' :
                                    action.priority === 'medium' ? 'bg-white/40' :
                                    'bg-white/10'
                                } shadow-[0_0_8px_rgba(99,102,241,0.2)]`} />
                                <span className="text-[12px] font-bold text-white/40 group-hover:text-white/80 transition-colors flex-1 tracking-tight">
                                    {action.label}
                                </span>
                                <ArrowRight size={14} weight="bold" className="text-white/10 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                            </Link>
                        ))}
                    </div>
                </section>
                </>
                )}
            </div>

            {/* Footer CTA */}
            <div className="px-6 py-6 border-t border-white/5 bg-white/[0.02]">
                <Link
                    href="/chat/overview"
                    className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400 hover:bg-indigo-500/20 transition-all no-underline shadow-lg"
                >
                    <FileText size={16} weight="light" />
                    Strategic Overview
                </Link>
            </div>
        </motion.aside>
    );
}
