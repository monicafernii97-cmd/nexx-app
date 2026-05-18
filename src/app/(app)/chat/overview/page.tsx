'use client';

import { useState, useCallback } from 'react';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';
import {
    SquaresFour, Notebook, PushPin, CalendarCheck,
    ArrowRight, Plus,
} from '@phosphor-icons/react';
import { useWorkspace } from '@/lib/workspace-context';
import { parseEventDate, safeEventDate } from '@/lib/workspace-constants';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ItemCard } from '@/components/workspace/ItemCard';
import { EmptyState } from '@/components/workspace/EmptyState';
import { PatternsBlock } from '@/components/workspace/PatternsBlock';
import { NarrativeBlock, type CaseNarrative } from '@/components/workspace/NarrativeBlock';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useToast } from '@/components/feedback/ToastProvider';
import { formatCaseNarrativeAsDraft } from '@/lib/workspace-types';

/** Check whether a memory item is the generated case summary narrative draft. */
function hasSummaryNarrativeMetadata(metadataJson?: string) {
    if (!metadataJson) return false;
    try {
        const metadata = JSON.parse(metadataJson) as { source?: string; artifactType?: string };
        return metadata.artifactType === 'case_summary_narrative'
            && (metadata.source === 'workspace_narrative' || metadata.source === 'workspace_overview');
    } catch {
        return false;
    }
}



/**
 * Workspace Overview — The "Case Thinking Environment".
 *
 * Center = Truth layout:
 * Facts → Timeline → Patterns (if earned) → Narrative (highest value)
 *
 * This mirrors how a human thinks:
 * "What happened → When → Is there a pattern → What does it all mean?"
 */
export default function WorkspaceOverview() {
    const { pins, memory, timeline, counts, removeMemory, updateMemory, activeCaseId } = useWorkspace();
    const { showToast } = useToast();
    const saveToCaseMemory = useMutation(api.caseMemory.save);



    // ── Detected Patterns from Convex ──
    const detectedPatterns = useQuery(
        api.detectedPatterns.listByCase,
        activeCaseId ? { caseId: activeCaseId } : 'skip'
    );

    // ── Pattern Detection API trigger ──
    const [isDetectingPatterns, setIsDetectingPatterns] = useState(false);
    const [patternError, setPatternError] = useState<string | null>(null);

    const handleDetectPatterns = useCallback(async () => {
        if (!activeCaseId || isDetectingPatterns) return;
        setIsDetectingPatterns(true);
        setPatternError(null);
        try {
            const res = await fetch('/api/workspace/patterns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caseId: activeCaseId }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Pattern detection failed');
            }
        } catch (err) {
            setPatternError(err instanceof Error ? err.message : 'Pattern detection failed');
        } finally {
            setIsDetectingPatterns(false);
        }
    }, [activeCaseId, isDetectingPatterns]);

    // ── Narrative Generation API trigger ──
    const [narrative, setNarrative] = useState<CaseNarrative | null>(null);
    const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false);
    const [narrativeError, setNarrativeError] = useState<string | null>(null);
    const [isSavingNarrative, setIsSavingNarrative] = useState(false);
    const [isDownloadingNarrative, setIsDownloadingNarrative] = useState(false);
    const [isCreatingExhibit, setIsCreatingExhibit] = useState(false);

    const handleGenerateNarrative = useCallback(async () => {
        if (!activeCaseId || isGeneratingNarrative) return;
        setIsGeneratingNarrative(true);
        setNarrativeError(null);
        try {
            const res = await fetch('/api/workspace/narrative', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caseId: activeCaseId }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Narrative generation failed');
            }
            const data = await res.json();
            setNarrative(data);
        } catch (err) {
            setNarrativeError(err instanceof Error ? err.message : 'Narrative generation failed');
        } finally {
            setIsGeneratingNarrative(false);
        }
    }, [activeCaseId, isGeneratingNarrative]);

    // Recent key facts only (filtered from all memory)
    const recentKeyFacts = [...(memory ?? [])]
        .filter(item => item.type === 'key_fact')
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 4);
    const recentTimeline = [...(timeline || [])]
        .sort((a, b) => {
            const dateA = parseEventDate(a.eventDate, a.createdAt);
            const dateB = parseEventDate(b.eventDate, b.createdAt);
            return dateB - dateA;
        })
        .slice(0, 5);

    const router = useRouter();



    const handleSaveNarrativeDraft = useCallback(async () => {
        if (!narrative || !activeCaseId || isSavingNarrative) return;
        setIsSavingNarrative(true);
        try {
            const title = narrative.title || 'Case Summary Narrative';
            const content = formatCaseNarrativeAsDraft(narrative);
            const existingDraft = memory?.find(item =>
                item.type === 'draft_snippet' && hasSummaryNarrativeMetadata(item.metadataJson)
            );

            if (existingDraft) {
                await updateMemory(existingDraft._id, { title, content });
            } else {
                await saveToCaseMemory({
                    caseId: activeCaseId,
                    type: 'draft_snippet',
                    title,
                    content,
                    metadataJson: JSON.stringify({ source: 'workspace_overview', artifactType: 'case_summary_narrative' }),
                    requestId: `workspace-narrative-draft-${activeCaseId}`,
                });
            }
            showToast({
                variant: 'success',
                title: 'Saved to Workspace',
                description: 'The summary narrative is available in Drafts & Work Product.',
                destination: { label: 'View Drafts', href: '/chat/drafts' },
            });
        } catch (err) {
            showToast({
                variant: 'error',
                title: 'Save failed',
                description: err instanceof Error ? err.message : 'Could not save narrative.',
            });
        } finally {
            setIsSavingNarrative(false);
        }
    }, [activeCaseId, isSavingNarrative, memory, narrative, saveToCaseMemory, showToast, updateMemory]);

    const handleDownloadNarrativePdf = useCallback(async () => {
        if (!narrative || isDownloadingNarrative) return;
        setIsDownloadingNarrative(true);
        try {
            const res = await fetch('/api/workspace/narrative/pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ narrative }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'PDF generation failed');
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${(narrative.title || 'case-summary-narrative').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'case-summary-narrative'}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            showToast({
                variant: 'error',
                title: 'Download failed',
                description: err instanceof Error ? err.message : 'Could not download the summary PDF.',
            });
        } finally {
            setIsDownloadingNarrative(false);
        }
    }, [isDownloadingNarrative, narrative, showToast]);

    const handleCreateExhibitNote = useCallback(async () => {
        if (!narrative || !activeCaseId || isCreatingExhibit) return;
        setIsCreatingExhibit(true);
        try {
            await saveToCaseMemory({
                caseId: activeCaseId,
                type: 'exhibit_note',
                title: `Exhibit note - ${narrative.title || 'Case Summary Narrative'}`,
                content: [
                    'Unsworn declaration style exhibit note.',
                    '',
                    formatCaseNarrativeAsDraft(narrative),
                ].join('\n'),
                metadataJson: JSON.stringify({ source: 'workspace_narrative', artifactType: 'unsworn_declaration_exhibit_note' }),
                requestId: `workspace-narrative-exhibit-${activeCaseId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            });
            showToast({
                variant: 'success',
                title: 'Saved to Exhibit Hub',
                description: 'The narrative is available as an exhibit-style note.',
            });
            router.push('/docuvault/exhibits');
        } catch (err) {
            showToast({
                variant: 'error',
                title: 'Exhibit save failed',
                description: err instanceof Error ? err.message : 'Could not create exhibit note.',
            });
        } finally {
            setIsCreatingExhibit(false);
        }
    }, [activeCaseId, isCreatingExhibit, narrative, router, saveToCaseMemory, showToast]);

    const stats = [
        { label: 'Key Facts', value: counts.keyFacts, loading: memory === undefined, icon: Notebook, color: 'var(--support-violet)', href: '/chat/key-points' },
        { label: 'Timeline Events', value: counts.timeline, loading: timeline === undefined, icon: CalendarCheck, color: 'var(--emerald)', href: '/chat/timeline' },
        { label: 'Pinned Items', value: counts.pins, loading: pins === undefined, icon: PushPin, color: 'var(--accent-icy)', href: '/chat/pinned' },
    ];

    return (
        <PageContainer>
            {/* ── Header ── */}
            <PageHeader
                icon={SquaresFour}
                title="Case Workspace"
                description="Review key facts, timeline, evidence-backed summaries, and any clearly supported patterns."
            />

            {/* ── Stats Row ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {stats.map((stat, i) => (
                    <Link key={stat.label} href={stat.href} className="no-underline group">
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.08 }}
                            className="p-5 rounded-[18px] border border-white/8 bg-white/[0.03] hover:bg-white/[0.05] hover:border-white/15 transition-all flex items-center justify-between"
                        >
                            <div className="flex items-center gap-3.5">
                                <div
                                    className="w-10 h-10 rounded-[12px] flex items-center justify-center border"
                                    style={{
                                        background: `${stat.color}15`,
                                        borderColor: `${stat.color}30`,
                                    }}
                                >
                                    <stat.icon size={20} weight="duotone" style={{ color: stat.color }} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-0.5">{stat.label}</p>
                                    <p className="text-xl font-bold text-white leading-none">
                                        {stat.loading ? <span className="inline-block w-5 h-5 rounded bg-white/10 animate-pulse" /> : stat.value}
                                    </p>
                                </div>
                            </div>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center bg-white/5 opacity-0 group-hover:opacity-100 transition-all">
                                <ArrowRight size={12} className="text-white/60" />
                            </div>
                        </motion.div>
                    </Link>
                ))}
            </div>

            {/* ── Section 1: Key Facts ── */}
            <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="mb-8"
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-[14px] bg-[var(--support-violet)]/10 border border-[var(--support-violet)]/20 flex items-center justify-center">
                            <Notebook size={18} weight="fill" className="text-[var(--support-violet)]" />
                        </div>
                        <div>
                            <h2 className="text-[18px] font-semibold text-white/90">Key Facts</h2>
                            <p className="text-[12px] text-white/30 mt-0.5">{counts.keyFacts} documented</p>
                        </div>
                    </div>
                    <Link href="/chat/key-points" className="text-[11px] font-bold uppercase tracking-wider text-[var(--support-violet)] hover:text-[var(--support-violet)]/80 transition-colors no-underline flex items-center gap-1">
                        View All <ArrowRight size={10} />
                    </Link>
                </div>

                {memory === undefined ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[1, 2].map(i => <div key={i} className="h-24 rounded-[18px] bg-white/5 animate-pulse" />)}
                    </div>
                ) : recentKeyFacts.length === 0 ? (
                    <EmptyState
                        icon={Notebook}
                        title="No Key Facts Yet"
                        description="Strategic insights saved from your AI sessions will appear here."
                        compact
                    />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {recentKeyFacts.map(item => (
                            <ItemCard
                                key={item._id}
                                id={item._id}
                                type={item.type}
                                title={item.title}
                                content={item.content}
                                createdAt={item.createdAt}
                                onRemove={removeMemory}
                                onUpdate={updateMemory}
                                compact
                            />
                        ))}
                    </div>
                )}
            </motion.section>

            {/* ── Section 2: Timeline Snapshot ── */}
            <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="mb-8"
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-[14px] bg-[var(--accent-emerald)]/10 border border-[var(--accent-emerald)]/20 flex items-center justify-center">
                            <CalendarCheck size={18} weight="fill" className="text-[var(--accent-emerald)]" />
                        </div>
                        <div>
                            <h2 className="text-[18px] font-semibold text-white/90">Timeline Snapshot</h2>
                            <p className="text-[12px] text-white/30 mt-0.5">{counts.confirmedTimeline} confirmed, {counts.timeline - counts.confirmedTimeline} pending</p>
                        </div>
                    </div>
                    <Link href="/chat/timeline" className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent-emerald)] hover:text-[var(--accent-emerald)]/80 transition-colors no-underline flex items-center gap-1">
                        Full Timeline <ArrowRight size={10} />
                    </Link>
                </div>

                {timeline === undefined ? (
                    <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-6">
                        {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse mb-3 last:mb-0" />)}
                    </div>
                ) : timeline.length === 0 ? (
                    <EmptyState
                        icon={CalendarCheck}
                        title="Timeline Empty"
                        description="Extract chronological events from chat to build your case story."
                        compact
                    />
                ) : (
                    <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-6">
                        {recentTimeline.map((event, i) => {
                            const displayDate = safeEventDate(event.eventDate);
                            return (
                                <div key={event._id} className="relative pl-8 pb-5 last:pb-0">
                                    {i !== recentTimeline.length - 1 && (
                                        <div className="absolute left-[5px] top-7 bottom-0 w-px bg-white/8" />
                                    )}
                                    <div className="absolute left-0 top-2 w-[11px] h-[11px] rounded-full border-2 border-[var(--accent-emerald)] bg-[var(--accent-emerald)]/20 shadow-[0_0_8px_var(--accent-emerald)]" />
                                    <div className="flex items-baseline gap-3 mb-1">
                                        <p className="text-[11px] font-bold text-white/35 tabular-nums">
                                            {displayDate ? format(displayDate, 'MMM d, yyyy') : 'Date Pending'}
                                        </p>
                                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                            event.status === 'confirmed'
                                                ? 'bg-[var(--accent-emerald)]/15 text-[var(--accent-emerald)]'
                                                : 'bg-white/5 text-white/25'
                                        }`}>
                                            {event.status}
                                        </span>
                                    </div>
                                    <p className="text-[14px] font-semibold text-white/80">{event.title}</p>
                                    <p className="text-[12px] text-white/40 line-clamp-1 mt-0.5">{event.description}</p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </motion.section>

            {/* ── Section 3: Observed Patterns (always show — PatternsBlock handles empty state) ── */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="mb-8"
            >
                <PatternsBlock patterns={(detectedPatterns ?? []).map(p => ({
                    title: p.title,
                    summary: p.summary,
                    category: p.category as import('@/lib/nexx/premiumAnalytics').BehaviorCategory,
                    confidence: p.confidence,
                    score: p.score,
                    supportingEvents: (() => {
                        try { return JSON.parse(p.eventsJson); }
                        catch { return []; }
                    })(),
                }))} />

                {/* Detect Patterns trigger */}
                <div className="mt-4 flex items-center gap-3">
                    <button
                        type="button"
                        onClick={handleDetectPatterns}
                        disabled={isDetectingPatterns || !activeCaseId}
                        className="text-[11px] font-bold uppercase tracking-wider px-4 py-2 rounded-full border border-white/10 hover:border-white/25 bg-white/[0.03] hover:bg-white/[0.06] text-white/50 hover:text-white/80 transition-all disabled:opacity-40 cursor-pointer"
                    >
                        {isDetectingPatterns ? 'Analyzing...' : 'Detect Patterns'}
                    </button>
                    {patternError && (
                        <p className="text-[11px] text-red-400/70">{patternError}</p>
                    )}
                </div>
            </motion.div>

            {/* ── Section 4: Case Summary Narrative (highest value) ── */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                className="mb-8"
            >
                <NarrativeBlock
                    narrative={narrative}
                    isGenerating={isGeneratingNarrative}
                    onGenerate={handleGenerateNarrative}
                    onSaveToWorkspace={handleSaveNarrativeDraft}
                    onDownloadPdf={handleDownloadNarrativePdf}
                    onCreateExhibit={handleCreateExhibitNote}
                    isSavingToWorkspace={isSavingNarrative}
                    isDownloadingPdf={isDownloadingNarrative}
                    isCreatingExhibit={isCreatingExhibit}
                />
                {narrativeError && (
                    <p className="text-[11px] text-red-400/70 mt-2">{narrativeError}</p>
                )}
            </motion.div>

            {/* ── "New Strategic Session" card ── */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.65 }}
            >
                <Link href="/chat" className="no-underline block">
                    <motion.div
                        whileHover={{ scale: 1.01 }}
                        className="p-8 rounded-[22px] bg-gradient-to-br from-[#123D7E] to-[#0A1128] border border-white/15 shadow-xl text-center group"
                    >
                        <div className="w-14 h-14 rounded-full border border-white/20 bg-white/10 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                            <Plus size={24} className="text-white" />
                        </div>
                        <p className="text-[16px] font-bold text-white mb-1">New Strategic Session</p>
                        <p className="text-[12px] text-white/50 font-medium max-w-[400px] mx-auto">
                            Continue building your case context with NEXX AI. Facts, timeline events, and patterns are captured automatically.
                        </p>
                    </motion.div>
                </Link>
            </motion.div>


        </PageContainer>
    );
}
