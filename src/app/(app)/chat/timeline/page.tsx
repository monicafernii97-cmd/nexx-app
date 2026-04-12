'use client';

import { useState, useMemo, useCallback } from 'react';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';
import { CalendarCheck, MagnifyingGlass, Check, Clock, Tag, Funnel } from '@phosphor-icons/react';
import { useWorkspace } from '@/lib/workspace-context';
import { parseEventDate, safeEventDate } from '@/lib/workspace-constants';
import { useToast } from '@/components/feedback/ToastProvider';
import { EmptyState } from '@/components/workspace/EmptyState';
import { FilterTabs } from '@/components/workspace/FilterTabs';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import type { Id } from '@convex/_generated/dataModel';

const TABS = [
    { id: 'all', label: 'All Events' },
    { id: 'candidate', label: 'Candidates' },
    { id: 'confirmed', label: 'Confirmed' },
];

/**
 * Timeline Explorer — Visual chronological manager for case events.
 * Features a vertical timeline layout, state management (candidate -> confirmed),
 * and tagging support.
 */
export default function TimelineExplorer() {
    const { timeline, confirmTimeline } = useWorkspace();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [confirmingId, setConfirmingId] = useState<Id<'timelineCandidates'> | null>(null);

    const filteredEvents = useMemo(() => {
        if (!timeline) return [];
        return timeline.filter(event => {
            const matchesTab = activeTab === 'all' || event.status === activeTab;
            const matchesSearch = event.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                 event.description.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesTab && matchesSearch;
        }).sort((a, b) => {
            const dateA = parseEventDate(a.eventDate, a.createdAt);
            const dateB = parseEventDate(b.eventDate, b.createdAt);
            return dateB - dateA;
        });
    }, [timeline, activeTab, searchQuery]);

    const tabConfigs = useMemo(() => {
        return TABS.map(tab => ({
            ...tab,
            count: tab.id === 'all' ? timeline?.length : timeline?.filter(t => t.status === tab.id).length
        }));
    }, [timeline]);

    // CR #7 — Confirm with pending guard + error handling
    const handleConfirm = useCallback(async (candidateId: Id<'timelineCandidates'>) => {
        if (confirmingId) return;
        setConfirmingId(candidateId);
        try {
            await confirmTimeline(candidateId);
            showToast({ title: 'Event Confirmed', description: 'Timeline entry has been verified.', variant: 'success' });
        } catch {
            showToast({ title: 'Confirmation Failed', description: 'Could not confirm this event. Please try again.', variant: 'error' });
        } finally {
            setConfirmingId(null);
        }
    }, [confirmingId, confirmTimeline, showToast]);

    return (
        <PageContainer>
            <PageHeader
                icon={CalendarCheck}
                title="Event Timeline"
                description="Chronological record of incidents, communications, and court milestones extracted from your case history."
            />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                <FilterTabs 
                    tabs={tabConfigs}
                    activeTabId={activeTab}
                    onTabChange={setActiveTab}
                    activeColor="var(--emerald)"
                />

                <div className="relative max-w-sm w-full">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        <MagnifyingGlass size={16} className="text-white/30" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search events..."
                        aria-label="Search timeline events"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-[14px] text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[var(--emerald)]/50 focus:border-[var(--emerald)]/50 transition-all"
                    />
                </div>
            </div>

            {timeline === undefined ? (
                <div className="max-w-3xl mx-auto space-y-8 opacity-40 animate-pulse">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="flex gap-8">
                            <div className="w-px bg-white/10 h-32 relative">
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white/10" />
                            </div>
                            <div className="flex-1 h-24 glass-ethereal rounded-2xl" />
                        </div>
                    ))}
                </div>
            ) : filteredEvents.length === 0 && (timeline?.length ?? 0) === 0 ? (
                /* Truly empty — no timeline data at all */
                <EmptyState
                    icon={CalendarCheck}
                    title="Timeline Empty"
                    description="You haven't extracted any timeline events yet. Ask NEXX during chat to 'Add this to my timeline'."
                    actionLabel="Go to Chat"
                    actionHref="/chat"
                />
            ) : filteredEvents.length === 0 ? (
                /* Has data but current filter/search yields nothing */
                <EmptyState
                    icon={searchQuery ? MagnifyingGlass : Funnel}
                    title={searchQuery ? "No Events Found" : "No Events Match This Filter"}
                    description={searchQuery ? "Try searching for a different date or keyword." : "None of your timeline events match the selected status. Try another tab or view all."}
                    actionLabel="Clear Filters"
                    onAction={() => { setSearchQuery(''); setActiveTab('all'); }}
                />
            ) : (
                <div className="max-w-4xl mx-auto relative px-4 sm:px-8">
                    {/* The Rail */}
                    <div className="absolute left-[35.5px] top-4 bottom-4 w-px bg-gradient-to-b from-[var(--emerald)]/40 via-white/10 to-transparent hidden sm:block" />

                    <div className="space-y-12">
                        <AnimatePresence mode="popLayout">
                            {filteredEvents.map((event, i) => {
                                // Validate eventDate once for safe formatting
                                const displayDate = safeEventDate(event.eventDate);
                                return (
                                <motion.div
                                    key={event._id}
                                    layout
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="flex flex-col sm:flex-row gap-4 sm:gap-12 relative group"
                                >
                                    {/* Date Marker (Desktop) */}
                                    <div className="hidden sm:flex flex-col items-center w-12 pt-2 z-10">
                                        <div className={`
                                            w-4 h-4 rounded-full border-2 transition-all duration-500
                                            ${event.status === 'confirmed' 
                                                ? 'bg-[var(--emerald)] border-[var(--emerald)] shadow-[0_0_12px_var(--emerald)]' 
                                                : 'bg-[#0A1128] border-white/20 group-hover:border-[var(--emerald)]/60'}
                                        `} />
                                        <div className="mt-4 flex flex-col items-center">
                                            <span className="text-[10px] font-bold text-white/40 uppercase vertical-text">
                                                {displayDate ? format(displayDate, 'yyyy') : 'Pending'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Content Card */}
                                    <div className="flex-1 glass-ethereal rounded-[2rem] border border-white/10 p-6 hover:border-white/20 transition-all hover:bg-white/[0.02]">
                                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                                            <div>
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--emerald)]">
                                                        {displayDate ? format(displayDate, 'MMMM d, yyyy') : 'Date to be verified'}
                                                    </span>
                                                    {event.status === 'candidate' && (
                                                        <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 text-[9px] font-bold uppercase border border-amber-500/20">Candidate</span>
                                                    )}
                                                </div>
                                                <h3 className="text-xl font-serif text-white tracking-tight leading-tight">{event.title}</h3>
                                            </div>

                                            {event.status === 'candidate' && (
                                                <button
                                                    onClick={() => handleConfirm(event._id)}
                                                    disabled={confirmingId !== null}
                                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--emerald)]/20 text-[var(--emerald)] border border-[var(--emerald)]/30 text-xs font-bold uppercase tracking-widest hover:bg-[var(--emerald)] transition-all hover:text-white ${confirmingId !== null ? 'opacity-50 cursor-wait' : ''}`}
                                                >
                                                    <Check size={14} weight="bold" /> {confirmingId === event._id ? 'Confirming...' : 'Confirm'}
                                                </button>
                                            )}
                                        </div>

                                        <p className="text-[14px] text-white/60 leading-relaxed mb-6">
                                            {event.description}
                                        </p>

                                        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/5">
                                            <div className="flex flex-wrap gap-2">
                                                {event.tags?.map(tag => (
                                                    <div key={tag} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-[10px] font-bold text-white/40 uppercase tracking-wider">
                                                        <Tag size={10} /> {tag}
                                                    </div>
                                                ))}
                                                {!event.tags?.length && (
                                                    <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest italic">No Tags</span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2 text-white/20">
                                                <Clock size={12} />
                                                <span className="text-[10px] font-bold uppercase tracking-widest">Added {format(event.createdAt, 'MMM d')}</span>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>
            )}
        </PageContainer>
    );
}
