'use client';

import Link from 'next/link';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { ArrowLeft, ClockCounterClockwise, FileText, SealCheck } from '@phosphor-icons/react';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';
import { useWorkspace } from '@/lib/workspace-context';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
});

const formatIncidentDate = (date: string) => {
    const parsed = new Date(`${date}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? date : dateFormatter.format(parsed);
};

/** Full incident timeline archive for the active case. */
export default function IncidentHistoryPage() {
    const { activeCaseId } = useWorkspace();
    const incidents = useQuery(
        api.incidents.list,
        activeCaseId ? { caseId: activeCaseId } : 'skip',
    );

    const sortedIncidents = [...(incidents ?? [])].sort((a, b) => {
        const aDate = new Date(`${a.date}T${a.time || '00:00'}`).getTime();
        const bDate = new Date(`${b.date}T${b.time || '00:00'}`).getTime();
        return (Number.isNaN(bDate) ? b.createdAt : bDate) - (Number.isNaN(aDate) ? a.createdAt : aDate);
    });

    return (
        <PageContainer>
            <PageHeader
                icon={ClockCounterClockwise}
                title="Incident History"
                description="Full chronological archive of saved incidents for the active case."
            />

            <div className="mb-8">
                <Link
                    href="/incident-report"
                    className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-300 hover:text-indigo-200 transition-colors no-underline"
                >
                    <ArrowLeft size={14} weight="bold" />
                    Back to Intake
                </Link>
            </div>

            {!activeCaseId ? (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-6 py-5 text-amber-300 text-xs font-bold uppercase tracking-[0.18em]">
                    Select an active case to view incident history.
                </div>
            ) : incidents === undefined ? (
                <div className="space-y-4" aria-label="Loading incident history">
                    {[1, 2, 3].map((item) => (
                        <div key={item} className="h-28 rounded-2xl bg-white/5 border border-white/5 animate-pulse" />
                    ))}
                </div>
            ) : sortedIncidents.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-10 text-center">
                    <FileText size={28} className="mx-auto text-white/25 mb-3" />
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/35">
                        No incidents saved yet
                    </p>
                </div>
            ) : (
                <div className="relative max-w-4xl mx-auto">
                    <div className="absolute left-[7px] top-4 bottom-4 w-px bg-white/10" />
                    <div className="space-y-8">
                        {sortedIncidents.map((incident) => (
                            <article key={incident._id} className="relative pl-9">
                                <div className="absolute left-0 top-2 w-4 h-4 rounded-full border border-indigo-400/60 bg-[#020617] shadow-[0_0_10px_rgba(99,102,241,0.35)]" />
                                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 hover:border-white/20 transition-colors">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-300">
                                                {formatIncidentDate(incident.date)}
                                            </span>
                                            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                                                {incident.time || 'Time not set'}
                                            </span>
                                        </div>
                                        {incident.status === 'confirmed' && (
                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                                                <SealCheck size={12} weight="fill" />
                                                Confirmed
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[15px] leading-relaxed text-white/70 font-serif whitespace-pre-wrap">
                                        {incident.narrative}
                                    </p>
                                    {incident.evidence?.length ? (
                                        <div className="mt-4 rounded-xl border border-white/10 bg-black/15 px-4 py-3">
                                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35 mb-2">
                                                Linked evidence
                                            </p>
                                            <ul className="space-y-1 text-[12px] leading-relaxed text-white/55">
                                                {incident.evidence.map((item, index) => (
                                                    <li key={`${incident._id}-evidence-${index}`}>{item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    ) : null}
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            )}
        </PageContainer>
    );
}
