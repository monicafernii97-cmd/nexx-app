'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CaretDown,
    MagnifyingGlass,
    Bell,
    Plus,
    Briefcase,
    Check,
} from '@phosphor-icons/react';
import { useWorkspace } from '@/lib/workspace-context';

/**
 * TopNav — 72px glassmorphic bar spanning CENTER + RIGHT columns.
 *
 * The left sidebar remains full-height; this bar sits above the
 * main content area and insights rail only.
 *
 * Features:
 * - Case Switcher dropdown
 * - Global search stub
 * - Notification bell stub
 */
export function TopNav() {
    const { activeCase, cases, setActiveCaseId } = useWorkspace();
    const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsSwitcherOpen(false);
            }
        };
        if (isSwitcherOpen) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isSwitcherOpen]);

    return (
        <div className="h-[72px] flex items-center justify-between px-8 hyper-glass rounded-2xl mb-6 glow-slate">
            {/* ── Left: Case Switcher ── */}
            <div ref={dropdownRef} className="relative">
                <button
                    onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
                    className="flex items-center gap-4 px-5 py-2.5 rounded-xl border border-white/5 hover:border-white/20 bg-white/[0.02] hover:bg-white/5 transition-all group cursor-pointer"
                    aria-label="Switch case"
                    aria-expanded={isSwitcherOpen}
                >
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500/20 to-indigo-500/5 border border-indigo-500/20 flex items-center justify-center shadow-lg">
                        <Briefcase size={18} weight="light" className="text-indigo-400" />
                    </div>
                    <div className="text-left">
                        <p className="text-[13px] font-bold text-white tracking-tight leading-tight truncate max-w-[200px]">
                            {activeCase?.title ?? 'Loading...'}
                        </p>
                        <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/20 mt-0.5">
                            Active Case
                        </p>
                    </div>
                    <motion.div
                        animate={{ rotate: isSwitcherOpen ? 180 : 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                        className="text-white/20 group-hover:text-white/40 transition-colors ml-2"
                    >
                        <CaretDown size={14} weight="bold" />
                    </motion.div>
                </button>

                {/* Dropdown */}
                <AnimatePresence>
                    {isSwitcherOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -8, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.98 }}
                            transition={{ duration: 0.15 }}
                            className="absolute top-full left-0 mt-3 w-[310px] p-2 rounded-2xl hyper-glass border border-white/10 shadow-2xl z-50 overflow-hidden"
                        >
                            <p className="px-4 py-3 text-[10px] font-bold tracking-[0.2em] uppercase text-white/30">
                                Global Workspace
                            </p>

                            <div className="space-y-1">
                                {cases?.map((c) => (
                                    <button
                                        key={c._id}
                                        onClick={() => {
                                            setActiveCaseId(c._id);
                                            setIsSwitcherOpen(false);
                                        }}
                                        disabled={c.status === 'archived'}
                                        className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${
                                            c.status === 'archived'
                                                ? 'opacity-40 cursor-not-allowed border border-transparent'
                                                : c._id === activeCase?._id
                                                    ? 'bg-white/10 border border-white/10 cursor-pointer'
                                                    : 'hover:bg-white/5 border border-transparent cursor-pointer'
                                        }`}
                                    >
                                        <Briefcase size={18} weight={c._id === activeCase?._id ? 'fill' : 'light'} className={c._id === activeCase?._id ? 'text-indigo-400' : 'text-white/30'} />
                                        <span className={`text-[13px] font-bold truncate flex-1 text-left ${c._id === activeCase?._id ? 'text-white' : 'text-white/50'}`}>
                                            {c.title}
                                        </span>
                                        {c._id === activeCase?._id && (
                                            <Check size={16} weight="bold" className="text-emerald-400" />
                                        )}
                                    </button>
                                ))}
                            </div>

                            <div className="mt-2 pt-2 border-t border-white/5">
                                <button
                                    aria-disabled="true"
                                    className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-white/10 cursor-not-allowed"
                                >
                                    <Plus size={18} weight="light" />
                                    <span className="text-[13px] font-bold uppercase tracking-widest opacity-40">Add Case</span>
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Right: Actions ── */}
            <div className="flex items-center gap-4">
                <button
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white/20 hover:text-white/40 transition-colors cursor-not-allowed"
                    title="Search — coming soon"
                >
                    <MagnifyingGlass size={20} weight="light" />
                </button>
                <button
                    className="relative w-10 h-10 rounded-xl flex items-center justify-center text-white/20 hover:text-white/40 transition-colors cursor-not-allowed"
                    title="Notifications — coming soon"
                >
                    <Bell size={20} weight="light" />
                    {/* Badge potential */}
                </button>
            </div>
        </div>
    );
}
