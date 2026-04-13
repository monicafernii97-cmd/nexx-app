'use client';

/**
 * CaseSwitcher — Dropdown to switch between cases from the Sidebar.
 *
 * Shows the active case name with a dropdown of all cases.
 * Includes "New Case" and "Archive" actions.
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CaretUpDown,
    Plus,
    Archive,
    FolderOpen,
    Check,
} from '@phosphor-icons/react';
import { useWorkspace } from '@/lib/workspace-context';
import { useToast } from '@/components/feedback/ToastProvider';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';

/**
 * CaseSwitcher — Sidebar dropdown to switch between active cases.
 * Shows the active case name and provides actions to create or archive cases.
 */
export function CaseSwitcher() {
    const { activeCase, cases, activeCaseId, setActiveCaseId } = useWorkspace();
    const { showToast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const createCase = useMutation(api.cases.create);
    const archiveCase = useMutation(api.cases.archive);
    const unarchiveCase = useMutation(api.cases.unarchive);

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    // Close on Escape
    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') setIsOpen(false);
        }
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen]);

    const activeCases = cases?.filter(c => c.status === 'active') ?? [];
    const archivedCases = cases?.filter(c => c.status === 'archived') ?? [];

    const handleNewCase = async () => {
        if (isCreating) return;
        setIsCreating(true);
        try {
            const newCaseId = await createCase({
                title: `Case ${(cases?.length ?? 0) + 1}`,
            });
            if (newCaseId) {
                setActiveCaseId(newCaseId as Id<'cases'>);
            }
            setIsOpen(false);
        } catch (err) {
            console.error('Failed to create case:', err);
            showToast({
                title: 'Failed to create case',
                description: err instanceof Error ? err.message : 'Please try again.',
                variant: 'error',
            });
        } finally {
            setIsCreating(false);
        }
    };

    const handleArchive = async (caseId: Id<'cases'>) => {
        try {
            await archiveCase({ caseId });
            setIsOpen(false);
        } catch (err) {
            console.error('Failed to archive case:', err);
            showToast({
                title: 'Failed to archive case',
                description: err instanceof Error ? err.message : 'Please try again.',
                variant: 'error',
            });
        }
    };

    const handleUnarchive = async (caseId: Id<'cases'>) => {
        try {
            await unarchiveCase({ caseId });
            setActiveCaseId(caseId);
            setIsOpen(false);
        } catch (err) {
            console.error('Failed to restore case:', err);
            showToast({
                title: 'Failed to restore case',
                description: err instanceof Error ? err.message : 'Please try again.',
                variant: 'error',
            });
        }
    };

    if (!cases) {
        return (
            <div className="px-3 py-2">
                <div className="h-9 rounded-xl bg-white/5 animate-pulse" />
            </div>
        );
    }

    if (cases.length === 0) {
        return (
            <div className="px-3">
                <button
                    onClick={handleNewCase}
                    disabled={isCreating}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-dashed border-white/15 hover:bg-[var(--accent-icy)]/10 text-[var(--accent-icy)]/70 hover:text-[var(--accent-icy)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus size={14} weight="bold" />
                    <span className="text-[12px] font-bold">{isCreating ? 'Creating...' : 'Create First Case'}</span>
                </button>
            </div>
        );
    }

    return (
        <div ref={dropdownRef} className="relative px-3">
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="
                    w-full flex items-center justify-between gap-2 px-3 py-2.5
                    rounded-xl border border-white/10 bg-white/[0.03]
                    hover:bg-white/[0.06] hover:border-white/15
                    transition-all duration-200 group
                "
                aria-expanded={isOpen}
                aria-haspopup="listbox"
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-[var(--accent-icy)]/10 border border-[var(--accent-icy)]/20 flex items-center justify-center flex-shrink-0">
                        <FolderOpen size={14} weight="duotone" className="text-[var(--accent-icy)]" />
                    </div>
                    <div className="min-w-0 text-left">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 leading-none mb-0.5">
                            Active Case
                        </p>
                        <p className="text-[13px] font-semibold text-white/80 truncate leading-tight">
                            {activeCase?.title ?? 'Select Case'}
                        </p>
                    </div>
                </div>
                <CaretUpDown
                    size={14}
                    className="text-white/30 group-hover:text-white/50 transition-colors flex-shrink-0"
                />
            </button>

            {/* Dropdown */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="
                            absolute left-3 right-3 top-full mt-2 z-50
                            rounded-2xl border border-white/12 bg-[#0E1729]/95 backdrop-blur-xl
                            shadow-2xl shadow-black/40 overflow-hidden
                        "
                        role="listbox"
                        aria-label="Select case"
                    >
                        {/* Active Cases */}
                        <div className="p-2">
                            <p className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-white/25">
                                Active Cases
                            </p>
                            {activeCases.map(c => (
                                <div
                                    key={c._id}
                                    role="option"
                                    aria-selected={c._id === activeCaseId}
                                    tabIndex={0}
                                    onClick={() => {
                                        setActiveCaseId(c._id);
                                        setIsOpen(false);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            setActiveCaseId(c._id);
                                            setIsOpen(false);
                                        }
                                    }}
                                    className={`
                                        w-full flex items-center justify-between px-3 py-2.5 rounded-xl
                                        transition-all duration-150 group/item cursor-pointer
                                        ${c._id === activeCaseId
                                            ? 'bg-[var(--accent-icy)]/10 text-white'
                                            : 'hover:bg-white/5 text-white/60 hover:text-white/80'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <FolderOpen size={14} weight={c._id === activeCaseId ? 'fill' : 'regular'} />
                                        <span className="text-[13px] font-medium truncate">
                                            {c.title}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {c._id === activeCaseId && (
                                            <Check size={14} weight="bold" className="text-[var(--accent-icy)]" />
                                        )}
                                        {c._id !== activeCaseId && activeCases.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleArchive(c._id);
                                                }}
                                                className="p-1 rounded-lg opacity-0 group-hover/item:opacity-100 hover:bg-white/10 text-white/30 hover:text-white/60 transition-all cursor-pointer"
                                                aria-label={`Archive ${c.title}`}
                                            >
                                                <Archive size={12} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Archived Cases (if any) */}
                        {archivedCases.length > 0 && (
                            <div className="p-2 border-t border-white/5">
                                <p className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-white/20">
                                    Archived
                                </p>
                                {archivedCases.slice(0, 3).map(c => (
                                    <button
                                        key={c._id}
                                        onClick={() => handleUnarchive(c._id)}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/5 text-white/30 hover:text-white/50 transition-all"
                                        title={`Restore "${c.title}" to active`}
                                    >
                                        <Archive size={14} />
                                        <span className="text-[12px] font-medium truncate">{c.title}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* New Case */}
                        <div className="p-2 border-t border-white/8">
                            <button
                                onClick={handleNewCase}
                                disabled={isCreating}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[var(--accent-icy)]/10 text-[var(--accent-icy)]/70 hover:text-[var(--accent-icy)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Plus size={14} weight="bold" />
                                <span className="text-[12px] font-bold">{isCreating ? 'Creating...' : 'New Case'}</span>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
