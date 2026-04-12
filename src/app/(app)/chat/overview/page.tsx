'use client';

import { PageContainer, PageHeader } from '@/components/layout/PageLayout';
import { SquaresFour, Notebook, PushPin, CalendarCheck, ArrowRight, Clock, Plus } from '@phosphor-icons/react';
import { useWorkspace } from '@/lib/workspace-context';
import { parseEventDate } from '@/lib/workspace-constants';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ItemCard } from '@/components/workspace/ItemCard';

/**
 * Workspace Overview — A bento-style dashboard summarizing the entire case context.
 * Quick-access to recently pinned facts, strategic points, and timeline events.
 */
export default function WorkspaceOverview() {
    const { pins, memory, timeline, counts, removePin, removeMemory } = useWorkspace();

    const recentPins = pins?.slice(0, 2) || [];
    const recentMemory = memory?.slice(0, 2) || [];
    // CR #4 — Sort by eventDate/createdAt (NaN-safe) before slicing
    const recentTimeline = [...(timeline || [])]
        .sort((a, b) => {
            const dateA = parseEventDate(a.eventDate, a.createdAt);
            const dateB = parseEventDate(b.eventDate, b.createdAt);
            return dateB - dateA;
        })
        .slice(0, 2);

    const stats = [
        { label: 'Key Points', value: counts.memory, icon: Notebook, color: 'var(--support-violet)', href: '/chat/key-points' },
        { label: 'Pinned Focus', value: counts.pins, icon: PushPin, color: 'var(--accent-icy)', href: '/chat/pinned' },
        { label: 'Timeline Entries', value: counts.timeline, icon: CalendarCheck, color: 'var(--emerald)', href: '/chat/timeline' },
    ];

    return (
        <PageContainer>
            <PageHeader
                icon={SquaresFour}
                title="Case Workspace"
                description="Your strategic core. A holistic view of key facts, pinned focus points, and the emerging timeline captured from your sessions."
            />

            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {stats.map((stat, i) => (
                    <Link key={stat.label} href={stat.href} className="no-underline group">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="glass-ethereal p-6 rounded-[2rem] border border-white/10 hover:border-white/20 hover:bg-white/[0.03] transition-all flex items-center justify-between"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 shadow-inner">
                                    <stat.icon size={24} weight="duotone" style={{ color: stat.color }} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">{stat.label}</p>
                                    <p className="text-2xl font-serif text-white leading-none">{stat.value}</p>
                                </div>
                            </div>
                            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">
                                <ArrowRight size={14} className="text-white" />
                            </div>
                        </motion.div>
                    </Link>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Recent Logic (Key Points) */}
                <div className="lg:col-span-8 space-y-6">
                    <section>
                        <div className="flex items-center justify-between mb-4 px-2">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-white/50 flex items-center gap-2">
                                <Notebook size={14} /> Recently Saved Points
                            </h3>
                            <Link href="/chat/key-points" className="text-xs font-semibold text-[var(--support-violet)] hover:underline">View All</Link>
                        </div>
                        
                        {memory === undefined ? (
                            <div className="h-48 glass-ethereal rounded-3xl animate-pulse" />
                        ) : memory.length === 0 ? (
                            <div className="p-12 text-center glass-ethereal rounded-3xl border border-white/5 opacity-40">
                                <p className="text-xs font-semibold uppercase tracking-widest text-white">No key points saved yet</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {recentMemory.map(item => (
                                    <ItemCard
                                        key={item._id}
                                        id={item._id}
                                        type={item.type}
                                        title={item.title}
                                        content={item.content}
                                        createdAt={item.createdAt}
                                        onRemove={removeMemory}
                                        compact
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    <section>
                        <div className="flex items-center justify-between mb-4 px-2">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-white/50 flex items-center gap-2">
                                <PushPin size={14} /> Current Pinned Focus
                            </h3>
                            <Link href="/chat/pinned" className="text-xs font-semibold text-[var(--accent-icy)] hover:underline">Manage All</Link>
                        </div>

                        {pins === undefined ? (
                            <div className="h-48 glass-ethereal rounded-3xl animate-pulse" />
                        ) : pins.length === 0 ? (
                            <div className="p-12 text-center glass-ethereal rounded-3xl border border-white/5 opacity-40">
                                <p className="text-xs font-semibold uppercase tracking-widest text-white">Focus list is empty</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {recentPins.map(pin => (
                                    <ItemCard
                                        key={pin._id}
                                        id={pin._id}
                                        type={pin.type}
                                        title={pin.title}
                                        content={pin.content}
                                        createdAt={pin.createdAt}
                                        onRemove={removePin}
                                        isPinned
                                        compact
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                {/* Right Column: Timeline Glimpse */}
                <div className="lg:col-span-4 h-full">
                    <section className="h-full flex flex-col">
                        <div className="flex items-center justify-between mb-4 px-2">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-white/50 flex items-center gap-2">
                                <Clock size={14} /> Timeline Feed
                            </h3>
                            <Link href="/chat/timeline" className="text-xs font-semibold text-[var(--emerald)] hover:underline">Event Explorer</Link>
                        </div>
                        
                        <div className="flex-1 glass-ethereal rounded-[2.5rem] p-6 border border-white/10 flex flex-col">
                            {timeline === undefined ? (
                                <div className="flex-1 flex flex-col gap-4">
                                    {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white/5 rounded-2xl animate-pulse" />)}
                                </div>
                            ) : timeline.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40 py-12">
                                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                                        <CalendarCheck size={32} />
                                    </div>
                                    <p className="text-xs font-semibold uppercase tracking-widest">Timeline Pristine</p>
                                    <p className="text-[10px] mt-2 max-w-[160px]">Extract chronological events from chat to build your story.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {recentTimeline.map((event, i) => (
                                        <div key={event._id} className="relative pl-6 pb-6 last:pb-0">
                                            {i !== recentTimeline.length - 1 && (
                                                <div className="absolute left-[3px] top-6 bottom-0 w-px bg-white/10" />
                                            )}
                                            <div className="absolute left-0 top-1.5 w-[7px] h-[7px] rounded-full bg-[var(--emerald)] shadow-[0_0_8px_var(--emerald)]" />
                                            <p className="text-[10px] font-bold text-white/40 uppercase mb-1">{event.eventDate || 'Date Pending'}</p>
                                            <p className="text-sm font-semibold text-white truncate">{event.title}</p>
                                            <p className="text-[11px] text-white/60 line-clamp-1 mt-1">{event.description}</p>
                                        </div>
                                    ))}
                                    <Link 
                                        href="/chat/timeline"
                                        className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors pt-2"
                                    >
                                        View All Events <ArrowRight size={12} />
                                    </Link>
                                </div>
                            )}
                            
                            <Link href="/chat" className="mt-auto pt-8">
                                <motion.div 
                                    whileHover={{ scale: 1.02 }}
                                    className="p-6 rounded-[2rem] bg-gradient-to-br from-[#123D7E] to-[#0A1128] border border-white/20 shadow-xl text-center group"
                                >
                                    <div className="w-12 h-12 rounded-full border border-white/20 bg-white/10 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                        <Plus size={24} className="text-white" />
                                    </div>
                                    <p className="text-sm font-bold text-white mb-1">New Strategic Session</p>
                                    <p className="text-[10px] text-white/60 font-medium">Continue building your case context with NEXX AI.</p>
                                </motion.div>
                            </Link>
                        </div>
                    </section>
                </div>
            </div>
        </PageContainer>
    );
}
