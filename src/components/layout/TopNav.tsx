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
        <div
            className="h-[72px] flex items-center justify-between px-6 rounded-2xl border border-white/10 mb-6"
            style={{
                background: 'linear-gradient(135deg, rgba(10, 17, 40, 0.6), rgba(10, 17, 40, 0.3))',
                backdropFilter: 'blur(20px)',
            }}
        >
            {/* ── Left: Case Switcher ── */}
            <div ref={dropdownRef} className="relative">
                <button
                    onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all group cursor-pointer"
                    aria-label="Switch case"
                    aria-expanded={isSwitcherOpen}
                >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent-emerald)]/20 to-[var(--accent-emerald)]/5 border border-[var(--accent-emerald)]/20 flex items-center justify-center">
                        <Briefcase size={16} weight="fill" className="text-[var(--accent-emerald)]" />
                    </div>
                    <div className="text-left">
                        <p className="text-[13px] font-bold text-white leading-tight truncate max-w-[200px]">
                            {activeCase?.title ?? 'Loading...'}
                        </p>
                        <p className="text-[10px] font-semibold tracking-wider uppercase text-white/40">
                            Active Case
                        </p>
                    </div>
                    <motion.div
                        animate={{ rotate: isSwitcherOpen ? 180 : 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                        className="text-white/40 group-hover:text-white/60 transition-colors"
                    >
                        <CaretDown size={14} weight="bold" />
                    </motion.div>
                </button>

                {/* Dropdown */}
                <AnimatePresence>
                    {isSwitcherOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -8, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.96 }}
                            transition={{ duration: 0.15 }}
                            className="absolute top-full left-0 mt-2 w-[280px] p-2 rounded-xl border border-white/10 shadow-2xl z-50"
                            style={{
                                background: 'linear-gradient(135deg, rgba(10, 17, 40, 0.95), rgba(10, 17, 40, 0.9))',
                                backdropFilter: 'blur(24px)',
                            }}
                        >
                            <p className="px-3 py-2 text-[10px] font-bold tracking-[0.15em] uppercase text-white/30">
                                Your Cases
                            </p>

                            {cases?.filter(c => c.status === 'active').map((c) => (
                                <button
                                    key={c._id}
                                    onClick={() => {
                                        setActiveCaseId(c._id);
                                        setIsSwitcherOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all cursor-pointer ${
                                        c._id === activeCase?._id
                                            ? 'bg-white/10 border border-white/15'
                                            : 'hover:bg-white/5 border border-transparent'
                                    }`}
                                >
                                    <Briefcase size={16} weight={c._id === activeCase?._id ? 'fill' : 'regular'} className="text-white/50" />
                                    <span className="text-[13px] font-medium text-white/80 truncate flex-1 text-left">
                                        {c.title}
                                    </span>
                                    {c._id === activeCase?._id && (
                                        <Check size={14} weight="bold" className="text-[var(--accent-emerald)]" />
                                    )}
                                </button>
                            ))}

                            <div className="mt-1 pt-1 border-t border-white/5">
                                <button
                                    aria-disabled="true"
                                    tabIndex={-1}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/20 cursor-not-allowed"
                                >
                                    <Plus size={16} weight="bold" />
                                    <span className="text-[13px] font-medium">Add New Case</span>
                                    <span className="text-[10px] ml-auto opacity-50">Soon</span>
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Right: Actions ── */}
            <div className="flex items-center gap-2">
                <button
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white/20 border border-transparent cursor-not-allowed"
                    aria-label="Search"
                    aria-disabled="true"
                    tabIndex={-1}
                    title="Search — coming soon"
                >
                    <MagnifyingGlass size={18} weight="bold" />
                </button>
                <button
                    className="relative w-10 h-10 rounded-xl flex items-center justify-center text-white/20 border border-transparent cursor-not-allowed"
                    aria-label="Notifications"
                    aria-disabled="true"
                    tabIndex={-1}
                    title="Notifications — coming soon"
                >
                    <Bell size={18} weight="bold" />
                </button>
            </div>
        </div>
    );
}
