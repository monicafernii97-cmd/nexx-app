'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
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
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/lib/workspace-context';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useToast } from '@/components/feedback/ToastProvider';
import { GenerateReportModal } from '@/components/workspace/GenerateReportModal';
import type { OutputType, PatternHandling } from '@/lib/workspace-types';

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

/** Classifies a count against a threshold into a readiness level (strong, partial, missing). */
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

/** Shared loading skeleton items to prevent style/count drift between collapsed and expanded states. */
const SKELETON_PLACEHOLDERS = [1, 2, 3] as const;

interface WorkspaceReport {
    title?: string;
    generatedAt?: string;
    summary?: string;
    sections?: Array<{ heading?: string; body?: string }>;
    recommendations?: string[];
}

/** Convert a generated workspace report into a readable saved work product. */
function formatWorkspaceReport(report: WorkspaceReport): string {
    const sections = report.sections
        ?.map(section => {
            const heading = section.heading?.trim();
            const body = section.body?.trim();
            if (!heading && !body) return null;
            return [heading, body].filter(Boolean).join('\n');
        })
        .filter(Boolean) ?? [];
    const recommendations = report.recommendations?.filter(Boolean) ?? [];

    return [
        report.summary?.trim() && `Summary\n${report.summary.trim()}`,
        ...sections,
        recommendations.length > 0 && `Recommendations\n${recommendations.map((item, index) => `${index + 1}. ${item}`).join('\n')}`,
    ].filter(Boolean).join('\n\n');
}

/** True when the selected output should be available as a workspace draft. */
function includesSummaryDraft(outputType: OutputType) {
    return outputType === 'summary' || outputType === 'both';
}

/** True when the selected output should be staged inside Exhibit Hub. */
function includesExhibitNote(outputType: OutputType) {
    return outputType === 'court_document' || outputType === 'both';
}

function createStableReportOperationId(...parts: string[]) {
    const input = parts.join('\u001f');
    let hash = 5381;
    for (let index = 0; index < input.length; index += 1) {
        hash = ((hash << 5) + hash) ^ input.charCodeAt(index);
    }
    return `${parts[0]}-${(hash >>> 0).toString(36)}`;
}

/**
 * GlobalWorkspaceRail — The "Insights Rail" (280px sticky right panel).
 *
 * Replaces the old Pinned/Points tab switcher with an outcome-oriented
 * audit panel: Report Readiness, Source Health, and Suggested Actions.
 *
 * Visual philosophy: GUIDANCE — not noise. Just readiness, gaps, next steps.
 */
export function GlobalWorkspaceRail() {
    const { counts, pins, memory, timeline, activeCaseId } = useWorkspace();
    const [isExpanded, setIsExpanded] = useState(true);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const reportAbortControllerRef = useRef<AbortController | null>(null);
    const router = useRouter();
    const { showToast } = useToast();
    const saveCaseMemory = useMutation(api.caseMemory.save);

    // ── Detected patterns from Convex ──
    const detectedPatterns = useQuery(
        api.detectedPatterns.listByCase,
        activeCaseId ? { caseId: activeCaseId } : 'skip'
    );
    const patternCount = detectedPatterns?.length ?? 0;

    // True when at least one data query is still loading.
    // Prevents showing "missing" readiness for data that simply hasn't arrived yet.
    const isPatternsLoading = !!activeCaseId && detectedPatterns === undefined;
    const isLoading = pins === undefined || memory === undefined || timeline === undefined || isPatternsLoading;

    const handleGenerateReport = useCallback(async ({
        outputType,
        patternHandling,
    }: {
        outputType: OutputType;
        patternHandling: PatternHandling;
    }) => {
        if (!activeCaseId) {
            showToast({
                variant: 'warning',
                title: 'Select a case first',
                description: 'Choose an active case before generating a workspace report.',
            });
            return;
        }

        setIsGeneratingReport(true);
        reportAbortControllerRef.current?.abort();
        const reportController = new AbortController();
        reportAbortControllerRef.current = reportController;
        try {
            const response = await fetch('/api/workspace/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: reportController.signal,
                body: JSON.stringify({
                    caseId: activeCaseId,
                    outputType,
                    tone: 'attorney_ready',
                    patternHandling,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (reportController.signal.aborted) return;
            if (!response.ok) {
                throw new Error(typeof data.error === 'string' ? data.error : 'Report generation failed');
            }
            if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
                throw new Error('Generated report response was empty');
            }

            const report = data as WorkspaceReport;
            const title = report.title?.trim() || 'Case Workspace Report';
            const content = formatWorkspaceReport(report);
            if (!content.trim()) {
                throw new Error('Generated report was empty');
            }
            const reportOperationId = createStableReportOperationId(
                activeCaseId,
                outputType,
                patternHandling,
                title,
                content,
            );
            let exhibitNoteId: string | null = null;
            let savedAnyArtifact = false;
            const saveErrors: unknown[] = [];

            if (includesSummaryDraft(outputType)) {
                try {
                    await saveCaseMemory({
                        caseId: activeCaseId,
                        type: 'draft_snippet',
                        title,
                        content,
                        metadataJson: JSON.stringify({ source: 'insights_rail_report', artifactType: 'case_summary_report' }),
                        requestId: `insights-report-summary-${reportOperationId}`,
                    });
                    savedAnyArtifact = true;
                } catch (err) {
                    saveErrors.push(err);
                }
            }

            if (reportController.signal.aborted) return;

            if (includesExhibitNote(outputType)) {
                try {
                    const savedId = await saveCaseMemory({
                        caseId: activeCaseId,
                        type: 'exhibit_note',
                        title: `Exhibit overview - ${title}`,
                        content: [
                            'Generated workspace report source.',
                            '',
                            content,
                        ].join('\n'),
                        metadataJson: JSON.stringify({ source: 'insights_rail_report', artifactType: 'workspace_generated_text_exhibit_note' }),
                        requestId: `insights-report-exhibit-${reportOperationId}`,
                    });
                    exhibitNoteId = savedId ? String(savedId) : null;
                    savedAnyArtifact = Boolean(savedId) || savedAnyArtifact;
                    if (!savedId) {
                        saveErrors.push(new Error('Exhibit note save returned no id'));
                    }
                } catch (err) {
                    saveErrors.push(err);
                }
            }

            if (!savedAnyArtifact) {
                const firstError = saveErrors.find(error => error instanceof Error);
                throw firstError instanceof Error ? firstError : new Error('Report save failed');
            }
            if (reportController.signal.aborted) return;

            setIsReportModalOpen(false);
            showToast({
                variant: saveErrors.length ? 'warning' : 'success',
                title: saveErrors.length
                    ? 'Report saved with partial output'
                    : includesExhibitNote(outputType) ? 'Report staged in Exhibit Hub' : 'Report saved to Workspace',
                description: saveErrors.length
                    ? 'At least one requested report artifact was saved. Retry is safe and will reuse the same save keys.'
                    : includesExhibitNote(outputType)
                    ? 'The generated overview is ready for exhibit assembly.'
                    : 'The generated overview is saved as a workspace draft.',
            });

            router.push(exhibitNoteId
                ? `/docuvault/exhibits?sourceId=${encodeURIComponent(exhibitNoteId)}`
                : '/chat/overview'
            );
        } catch (err) {
            if (reportController.signal.aborted) return;
            showToast({
                variant: 'error',
                title: 'Report generation failed',
                description: err instanceof Error ? err.message : 'Please try again.',
            });
        } finally {
            if (reportAbortControllerRef.current === reportController) {
                reportAbortControllerRef.current = null;
                setIsGeneratingReport(false);
            }
        }
    }, [activeCaseId, router, saveCaseMemory, showToast]);

    const handleCloseReportModal = useCallback(() => {
        reportAbortControllerRef.current?.abort();
        reportAbortControllerRef.current = null;
        setIsGeneratingReport(false);
        setIsReportModalOpen(false);
    }, []);

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
                animate={{ width: 56 }}
                className="h-[calc(100dvh-2rem)] sticky top-4 flex flex-col items-center py-4 gap-4 glass-ethereal rounded-[1.5rem] border border-white/10 z-30"
            >
                <button
                    onClick={() => setIsExpanded(true)}
                    className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all group cursor-pointer"
                    aria-label="Expand insights rail"
                    title="Expand Insights"
                >
                    <CaretLeft size={18} weight="bold" className="group-hover:-translate-x-0.5 transition-transform" />
                </button>

                {/* Readiness summary icons */}
                <div className="flex flex-col gap-3 mt-4">
                    {isLoading ? (
                        <>
                            {SKELETON_PLACEHOLDERS.map(i => (
                                <div key={i} className="w-10 h-10 rounded-xl bg-white/5 animate-pulse" />
                            ))}
                        </>
                    ) : (
                        readiness.map((item) => (
                            <div
                                key={item.label}
                                className={`w-10 h-10 rounded-xl flex items-center justify-center border ${LEVEL_STYLES[item.level].bg}`}
                                title={`${item.label}: ${item.detail}`}
                            >
                                <item.icon size={18} weight="fill" className={LEVEL_STYLES[item.level].text} />
                            </div>
                        ))
                    )}
                </div>
            </motion.div>
        );
    }

    // ── Expanded State ──
    return (
        <motion.aside
            initial={false}
            animate={{ width: 240 }}
            className="h-[calc(100dvh-2rem)] sticky top-4 flex flex-col hyper-glass rounded-[1.5rem] overflow-hidden z-30 glow-slate"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-1">
                <h2 className="text-[10px] font-bold tracking-[0.2em] uppercase text-indigo-300/80">
                    Insights
                </h2>
                <button
                    onClick={() => setIsExpanded(false)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 border border-white/10 text-white/30 hover:text-white transition-all cursor-pointer"
                    aria-label="Collapse insights rail"
                >
                    <CaretRight size={14} weight="bold" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col">

                {isLoading ? (
                    /* Skeleton placeholders while workspace queries resolve */
                    <div className="space-y-4 pt-2">
                        {SKELETON_PLACEHOLDERS.map(i => (
                            <div key={i} className="h-16 rounded-2xl bg-white/5 animate-pulse" />
                        ))}
                    </div>
                ) : (
                <div className="space-y-5">
                {/* ── Section 1: Report Readiness ── */}
                <section>
                    <div className="flex items-center gap-2 mb-3 px-1">
                        <ChartBar size={12} weight="light" className="text-white/20" />
                        <h3 className="text-[10px] font-bold tracking-[0.12em] uppercase text-white/55">
                            Case Readiness
                        </h3>
                    </div>

                    <div className="space-y-3">
                        {readiness.map((item) => {
                            const styles = LEVEL_STYLES[item.level];
                            return (
                                <div
                                    key={item.label}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all hover:bg-white/[0.04] ${styles.bg}`}
                                >
                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${styles.dot} shadow-[0_0_8px_rgba(255,255,255,0.2)]`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-bold text-white tracking-tight leading-tight">{item.label}</p>
                                        <p className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 ${styles.text}`}>{item.detail}</p>
                                    </div>
                                    {item.level === 'strong' && (
                                        <CheckCircle size={16} weight="light" className="text-emerald-400 flex-shrink-0" />
                                    )}
                                    {item.level === 'partial' && (
                                        <WarningCircle size={16} weight="light" className="text-amber-400/50 flex-shrink-0" />
                                    )}
                                    {item.level === 'missing' && (
                                        <Clock size={16} weight="light" className="text-white/20 flex-shrink-0" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* ── Section 2: Source Health ── */}
                <section>
                    <div className="flex items-center gap-2 mb-3 px-1">
                        <FileText size={12} weight="light" className="text-white/20" />
                        <h3 className="text-[10px] font-bold tracking-[0.12em] uppercase text-white/55">
                            Evidence Health
                        </h3>
                    </div>

                    <div className="px-3 py-3 rounded-xl border border-white/5 bg-white/[0.02] flex flex-col gap-1">
                        <div className="flex items-baseline justify-between mb-0.5">
                            <span className="text-xl font-serif text-white">{totalSources}</span>
                            <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Linked</span>
                        </div>
                        {unlinkedItems > 0 && (
                            <p className="text-[10px] font-bold text-amber-300/80 uppercase tracking-wider leading-relaxed">
                                {unlinkedItems} Items Unverified
                            </p>
                        )}
                        {unlinkedItems === 0 && totalItems > 0 && (
                            <p className="text-[10px] font-bold text-emerald-300/80 uppercase tracking-wider">
                                Full Verification Trace ✓
                            </p>
                        )}
                    </div>
                </section>

                {/* ── Section 3: Suggested Actions ── */}
                <section>
                    <div className="flex items-center gap-2 mb-3 px-1">
                        <Lightning size={12} weight="light" className="text-white/20" />
                        <h3 className="text-[10px] font-bold tracking-[0.12em] uppercase text-white/55">
                            Strategic Actions
                        </h3>
                    </div>

                    <div className="space-y-2">
                        {actions.map((action, i) => (
                            <Link
                                key={i}
                                href={action.href}
                                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.05] hover:border-indigo-500/30 transition-all group no-underline"
                            >
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                    action.priority === 'high' ? 'bg-indigo-400' :
                                    action.priority === 'medium' ? 'bg-white/40' :
                                    'bg-white/10'
                                } shadow-[0_0_8px_rgba(99,102,241,0.2)]`} />
                                <span className="text-[10px] font-bold text-white/70 group-hover:text-white transition-colors flex-1 tracking-tight leading-snug">
                                    {action.label}
                                </span>
                                <ArrowRight size={12} weight="bold" className="text-white/35 group-hover:text-indigo-300 group-hover:translate-x-1 transition-all" />
                            </Link>
                        ))}
                    </div>
                </section>

                {/* ── Generate Report CTA ── */}
                <section className="mt-auto pt-4 border-t border-white/5">
                    <button
                        type="button"
                        onClick={() => setIsReportModalOpen(true)}
                        className="flex items-center justify-center gap-2.5 w-full px-4 py-3 rounded-xl bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] border border-white/20 text-white text-[11px] font-bold uppercase tracking-widest shadow-[0_4px_16px_rgba(26,75,155,0.3)] hover:shadow-[0_8px_24px_rgba(26,75,155,0.4)] hover:-translate-y-0.5 transition-all no-underline group"
                    >
                        <FileText size={16} weight="bold" className="group-hover:scale-110 transition-transform" />
                        Generate Report
                    </button>
                </section>
                </div>
                )}
            </div>
            <GenerateReportModal
                isOpen={isReportModalOpen}
                onClose={handleCloseReportModal}
                onGenerate={handleGenerateReport}
                isGenerating={isGeneratingReport}
                itemCounts={{
                    facts: counts.keyFacts,
                    timeline: counts.timeline,
                    patterns: patternCount,
                    pins: counts.pins,
                }}
            />
        </motion.aside>
    );
}
