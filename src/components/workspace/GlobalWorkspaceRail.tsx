'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    PushPin, 
    Notebook, 
    CaretRight, 
    CaretLeft,
    ListBullets,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useWorkspace } from '@/lib/workspace-context';
import { RAIL_KEY_POINT_TYPES } from '@/lib/workspace-constants';
import { ItemCard } from './ItemCard';

/**
 * GlobalWorkspaceRail — Persistent right-side workspace companion.
 * 
 * Features:
 * - Tabbed view for Pinned Items and Key Points.
 * - Collapsible to a 48px icon-bar.
 * - Integrated with WorkspaceContext for real-time updates.
 * - Glassmorphic ethereal design matching the app shell.
 */
export function GlobalWorkspaceRail() {
    const { pins, memory, counts, removePin, removeMemory } = useWorkspace();
    const [isExpanded, setIsExpanded] = useState(true);
    const [activeTab, setActiveTab] = useState<'pinned' | 'memory'>('pinned');

    // Filter memory to key-point types for the rail rollup — uses shared constant
    const keyPoints = memory?.filter(m => 
        RAIL_KEY_POINT_TYPES.includes(m.type as typeof RAIL_KEY_POINT_TYPES[number])
    ) || [];

    // -------------------------------------------------------------------------
    // Collapsed State
    // -------------------------------------------------------------------------

    if (!isExpanded) {
        return (
            <motion.div
                initial={false}
                animate={{ width: 64 }}
                className="h-[calc(100dvh-3rem)] sticky top-6 flex flex-col items-center py-6 gap-6 glass-ethereal rounded-[2rem] border border-white/10 z-30"
            >
                <button
                    onClick={() => setIsExpanded(true)}
                    className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all group"
                    aria-label="Expand workspace rail"
                    title="Expand Workspace"
                >
                    <CaretLeft size={20} weight="bold" className="group-hover:-translate-x-0.5 transition-transform" />
                </button>

                <div className="flex flex-col gap-4">
                    <button 
                        onClick={() => { setIsExpanded(true); setActiveTab('pinned'); }}
                        aria-label={`Pinned items (${counts.pins})`}
                        className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all ${activeTab === 'pinned' ? 'bg-[var(--accent-icy)]/20 text-[var(--accent-icy)] border border-[var(--accent-icy)]/30' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                    >
                        <PushPin size={20} weight={activeTab === 'pinned' ? 'fill' : 'regular'} />
                        {counts.pins > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--accent-icy)] text-white text-[9px] font-bold rounded-full flex items-center justify-center border-2 border-[#0A1128]">
                                {counts.pins}
                            </span>
                        )}
                    </button>

                    <button 
                        onClick={() => { setIsExpanded(true); setActiveTab('memory'); }}
                        aria-label={`Key points (${keyPoints.length})`}
                        className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all ${activeTab === 'memory' ? 'bg-[var(--support-violet)]/20 text-[var(--support-violet)] border border-[var(--support-violet)]/30' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                    >
                        <Notebook size={20} weight={activeTab === 'memory' ? 'fill' : 'regular'} />
                        {keyPoints.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--support-violet)] text-white text-[9px] font-bold rounded-full flex items-center justify-center border-2 border-[#0A1128]">
                                {keyPoints.length}
                            </span>
                        )}
                    </button>
                </div>
            </motion.div>
        );
    }

    // -------------------------------------------------------------------------
    // Loading state check (CR #9)
    // -------------------------------------------------------------------------
    const isLoading = pins === undefined || memory === undefined;

    // -------------------------------------------------------------------------
    // Expanded State
    // -------------------------------------------------------------------------

    return (
        <motion.aside
            initial={false}
            animate={{ width: 340 }}
            className="h-[calc(100dvh-3rem)] sticky top-6 flex flex-col glass-ethereal rounded-[2rem] border border-white/10 overflow-hidden z-30 shadow-2xl"
        >
            {/* Header / Tabs */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold tracking-[0.1em] uppercase text-white/50">Workspace</h2>
                </div>
                <button
                    onClick={() => setIsExpanded(false)}
                    className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white transition-all"
                    aria-label="Collapse workspace rail"
                >
                    <CaretRight size={18} weight="bold" />
                </button>
            </div>

            {/* Tab Selection */}
            <div className="px-6 mb-4">
                <div
                    role="tablist"
                    aria-label="Workspace views"
                    className="flex items-center p-1 bg-black/20 rounded-xl border border-white/5 relative"
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                            e.preventDefault();
                            setActiveTab(activeTab === 'pinned' ? 'memory' : 'pinned');
                            // Move focus to the newly activated tab
                            const next = e.currentTarget.querySelector<HTMLButtonElement>(`[aria-selected="false"]`);
                            next?.focus();
                        }
                    }}
                >
                    <button
                        role="tab"
                        aria-selected={activeTab === 'pinned'}
                        tabIndex={activeTab === 'pinned' ? 0 : -1}
                        onClick={() => setActiveTab('pinned')}
                        aria-label="View pinned items"
                        id="workspace-tab-pinned"
                        aria-controls="workspace-panel-pinned"
                        className={`
                            flex-1 flex items-center justify-center gap-2 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all relative z-10
                            ${activeTab === 'pinned' ? 'text-white' : 'text-white/40 hover:text-white/60'}
                        `}
                    >
                        <PushPin size={14} weight={activeTab === 'pinned' ? 'fill' : 'bold'} />
                        Pinned
                    </button>
                    <button
                        role="tab"
                        aria-selected={activeTab === 'memory'}
                        tabIndex={activeTab === 'memory' ? 0 : -1}
                        onClick={() => setActiveTab('memory')}
                        aria-label="View key points"
                        id="workspace-tab-memory"
                        aria-controls="workspace-panel-memory"
                        className={`
                            flex-1 flex items-center justify-center gap-2 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all relative z-10
                            ${activeTab === 'memory' ? 'text-white' : 'text-white/40 hover:text-white/60'}
                        `}
                    >
                        <Notebook size={14} weight={activeTab === 'memory' ? 'fill' : 'bold'} />
                        Points
                    </button>

                    {/* Active Background Indicator */}
                    <motion.div
                        className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-gradient-to-br from-white/15 to-white/5 border border-white/10 rounded-lg shadow-inner shadow-white/5"
                        animate={{ x: activeTab === 'pinned' ? 0 : '100%' }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3 no-scrollbar">
                {isLoading ? (
                    /* CR #9 — show loading skeleton, not empty state */
                    <div className="flex flex-col gap-3 opacity-40 animate-pulse py-8">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-20 rounded-2xl bg-white/5 border border-white/5" />
                        ))}
                    </div>
                ) : (
                    <AnimatePresence mode="popLayout">
                        {activeTab === 'pinned' ? (
                            pins.length > 0 ? (
                                pins.map((pin) => (
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
                                ))
                            ) : (
                                <div className="flex flex-col items-center justify-center py-20 px-8 text-center opacity-40">
                                    <PushPin size={32} weight="duotone" className="mb-4" />
                                    <p className="text-xs font-semibold uppercase tracking-widest">No Active Pins</p>
                                    <p className="text-[10px] mt-2 leading-relaxed">Pin key facts from any chat to keep them in focus here.</p>
                                </div>
                            )
                        ) : (
                            keyPoints.length > 0 ? (
                                keyPoints.map((item) => (
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
                                ))
                            ) : (
                                <div className="flex flex-col items-center justify-center py-20 px-8 text-center opacity-40">
                                    <Notebook size={32} weight="duotone" className="mb-4" />
                                    <p className="text-xs font-semibold uppercase tracking-widest">Workspace Empty</p>
                                    <p className="text-[10px] mt-2 leading-relaxed">Strategic insights saved to your case will appear here.</p>
                                </div>
                            )
                        )}
                    </AnimatePresence>
                )}
            </div>

            {/* Footer — CR #10: Wire to real timeline route */}
            <div className="px-6 py-4 border-t border-white/5 bg-white/[0.02]">
                <Link
                    href="/chat/timeline"
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/5 border border-white/5 text-[11px] font-bold uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/10 transition-all no-underline"
                >
                    <ListBullets size={16} />
                    View Timeline
                </Link>
            </div>
        </motion.aside>
    );
}
