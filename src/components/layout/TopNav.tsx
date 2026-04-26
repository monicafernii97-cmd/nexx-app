'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CaretDown,
    MagnifyingGlass,
    Bell,
    Plus,
    Briefcase,
    Check,
    Archive,
} from '@phosphor-icons/react';
import { useWorkspace } from '@/lib/workspace-context';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useToast } from '@/components/feedback/ToastProvider';
import type { Id } from '@convex/_generated/dataModel';

/**
 * TopNav — 64px glassmorphic bar spanning CENTER + RIGHT columns.
 *
 * The left sidebar remains full-height; this bar sits above the
 * main content area and insights rail only.
 *
 * Features:
 * - Case Switcher dropdown with create, archive, and restore parity
 * - Global search stub (disabled)
 * - Notification bell stub (disabled)
 */
export function TopNav() {
    const { activeCase, cases, setActiveCaseId } = useWorkspace();
    const { showToast } = useToast();
    const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [pendingActions, setPendingActions] = useState<Set<Id<'cases'>>>(new Set());
    const dropdownRef = useRef<HTMLDivElement>(null);
    const creatingRef = useRef(false);
    const pendingActionsRef = useRef<Set<Id<'cases'>>>(new Set());

    const createCase = useMutation(api.cases.create);
    const archiveCase = useMutation(api.cases.archive);
    const unarchiveCase = useMutation(api.cases.unarchive);

    const activeCases = cases?.filter(c => c.status === 'active') ?? [];
    const archivedCases = cases?.filter(c => c.status === 'archived') ?? [];

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

    /** Create a new case and switch to it. */
    const handleNewCase = useCallback(async () => {
        if (creatingRef.current || cases === undefined) return;
        creatingRef.current = true;
        setIsCreating(true);
        try {
            const nextNum = cases.length + 1;
            const newCaseId = await createCase({
                title: `Case ${nextNum}`,
            });
            if (newCaseId) {
                setActiveCaseId(newCaseId as Id<'cases'>);
            }
            setIsSwitcherOpen(false);
        } catch (err) {
            console.error('[TopNav] Failed to create case:', err);
            showToast({
                title: 'Failed to create case',
                description: err instanceof Error ? err.message : 'Please try again.',
                variant: 'error',
            });
        } finally {
            creatingRef.current = false;
            setIsCreating(false);
        }
    }, [createCase, cases, setActiveCaseId, showToast]);

    /** Archive an active case. */
    const handleArchive = useCallback(async (caseId: Id<'cases'>) => {
        if (pendingActionsRef.current.has(caseId)) return;
        const nextPending = new Set(pendingActionsRef.current).add(caseId);
        pendingActionsRef.current = nextPending;
        setPendingActions(nextPending);
        try {
            await archiveCase({ caseId });
            setIsSwitcherOpen(false);
        } catch (err) {
            console.error('[TopNav] Failed to archive case:', err);
            showToast({
                title: 'Failed to archive case',
                description: err instanceof Error ? err.message : 'Please try again.',
                variant: 'error',
            });
        } finally {
            const cleared = new Set(pendingActionsRef.current);
            cleared.delete(caseId);
            pendingActionsRef.current = cleared;
            setPendingActions(cleared);
        }
    }, [archiveCase, showToast]);

    /** Restore an archived case and switch to it. */
    const handleUnarchive = useCallback(async (caseId: Id<'cases'>) => {
        if (pendingActionsRef.current.has(caseId)) return;
        const nextPending = new Set(pendingActionsRef.current).add(caseId);
        pendingActionsRef.current = nextPending;
        setPendingActions(nextPending);
        try {
            await unarchiveCase({ caseId });
            setActiveCaseId(caseId);
            setIsSwitcherOpen(false);
        } catch (err) {
            console.error('[TopNav] Failed to restore case:', err);
            showToast({
                title: 'Failed to restore case',
                description: err instanceof Error ? err.message : 'Please try again.',
                variant: 'error',
            });
        } finally {
            const cleared = new Set(pendingActionsRef.current);
            cleared.delete(caseId);
            pendingActionsRef.current = cleared;
            setPendingActions(cleared);
        }
    }, [unarchiveCase, setActiveCaseId, showToast]);

    return (
        <div className="h-[56px] flex items-center justify-between px-5 hyper-glass rounded-xl mb-3 glow-slate">
            {/* ── Left: Case Switcher ── */}
            <div ref={dropdownRef} className="relative">
                <button
                    type="button"
                    onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
                    className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-white/5 hover:border-white/20 bg-white/[0.02] hover:bg-white/5 transition-all group cursor-pointer"
                    aria-label="Switch case"
                    aria-expanded={isSwitcherOpen}
                >
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/20 to-indigo-500/5 border border-indigo-500/20 flex items-center justify-center shadow-lg">
                        <Briefcase size={14} weight="light" className="text-indigo-400" />
                    </div>
                    <div className="text-left">
                        <p className="text-[11px] font-bold text-white tracking-tight leading-tight truncate max-w-[150px]">
                            {cases === undefined ? 'Loading...' : activeCase?.title ?? 'No Case Yet'}
                        </p>
                        <p className="text-[8px] font-bold tracking-[0.2em] uppercase text-white/20 mt-0.5">
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
                            className="absolute top-full left-0 mt-3 w-[280px] p-1.5 rounded-2xl hyper-glass border border-white/10 shadow-2xl z-50 overflow-hidden"
                        >
                            <p className="px-4 py-3 text-[10px] font-bold tracking-[0.2em] uppercase text-white/30">
                                Active Cases
                            </p>

                            {/* Active cases */}
                            <div className="space-y-1">
                                {activeCases.map((c) => (
                                    <div
                                        key={c._id}
                                        className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all group/item ${
                                            c._id === activeCase?._id
                                                ? 'bg-white/10 border border-white/10'
                                                : 'hover:bg-white/5 border border-transparent'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (c._id !== activeCase?._id) {
                                                    setActiveCaseId(c._id);
                                                }
                                                setIsSwitcherOpen(false);
                                            }}
                                            className="flex items-center gap-4 flex-1 min-w-0 bg-transparent border-none p-0 text-inherit cursor-pointer text-left"
                                        >
                                            <Briefcase size={18} weight={c._id === activeCase?._id ? 'fill' : 'light'} className={c._id === activeCase?._id ? 'text-indigo-400' : 'text-white/30'} />
                                            <span className={`text-[13px] font-bold truncate flex-1 text-left ${c._id === activeCase?._id ? 'text-white' : 'text-white/50'}`}>
                                                {c.title}
                                            </span>
                                        </button>
                                        <div className="flex items-center gap-1">
                                            {c._id === activeCase?._id && (
                                                <Check size={16} weight="bold" className="text-emerald-400" />
                                            )}
                                            {c._id !== activeCase?._id && activeCases.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleArchive(c._id);
                                                    }}
                                                    disabled={pendingActions.has(c._id)}
                                                    className="p-1 rounded-lg opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100 focus-visible:opacity-100 hover:bg-white/10 text-white/30 hover:text-white/60 transition-all cursor-pointer disabled:opacity-50"
                                                    aria-label={`Archive ${c.title}`}
                                                    title={`Archive "${c.title}"`}
                                                >
                                                    <Archive size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Archived cases */}
                            {archivedCases.length > 0 && (
                                <div className="mt-1 pt-1 border-t border-white/5">
                                    <p className="px-4 py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-white/20">
                                        Archived
                                    </p>
                                    <div className="max-h-[180px] overflow-y-auto">
                                        {archivedCases.map((c) => (
                                            <button
                                                key={c._id}
                                                type="button"
                                                onClick={() => handleUnarchive(c._id)}
                                                disabled={pendingActions.has(c._id)}
                                                aria-label={`Restore "${c.title}" to active`}
                                                className="w-full flex items-center gap-4 px-4 py-2.5 rounded-xl hover:bg-white/5 text-white/30 hover:text-white/50 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                                title={`Restore "${c.title}" to active`}
                                            >
                                                <Archive size={16} />
                                                <span className="text-[12px] font-bold truncate">{c.title}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* New Case */}
                            <div className="mt-2 pt-2 border-t border-white/5">
                                <button
                                    type="button"
                                    onClick={handleNewCase}
                                    disabled={isCreating || cases === undefined}
                                    className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-indigo-500/10 text-indigo-400/70 hover:text-indigo-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    <Plus size={18} weight="bold" />
                                    <span className="text-[13px] font-bold uppercase tracking-widest">
                                        {cases === undefined ? 'Loading cases…' : isCreating ? 'Creating...' : 'New Case'}
                                    </span>
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Right: Actions ── */}
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    disabled
                    aria-label="Search (coming soon)"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white/20 transition-colors cursor-not-allowed"
                    title="Search — coming soon"
                >
                    <MagnifyingGlass size={16} weight="light" />
                </button>
                <button
                    type="button"
                    disabled
                    aria-label="Notifications (coming soon)"
                    className="relative w-8 h-8 rounded-lg flex items-center justify-center text-white/20 transition-colors cursor-not-allowed"
                    title="Notifications — coming soon"
                >
                    <Bell size={16} weight="light" />
                </button>
            </div>
        </div>
    );
}
