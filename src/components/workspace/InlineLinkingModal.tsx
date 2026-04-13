'use client';

/**
 * InlineLinkingModal — "Link to timeline" / "Link to incident" picker.
 *
 * Appears when a user wants to connect a workspace item to an existing
 * timeline event or incident. Provides search + select UI.
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    CalendarCheck,
    SealWarning,
    MagnifyingGlass,
    Link as LinkIcon,
    Check,
} from '@phosphor-icons/react';
import { useWorkspace } from '@/lib/workspace-context';
import { format } from 'date-fns';
import { safeEventDate } from '@/lib/workspace-constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LinkTarget = 'timeline' | 'incident';

interface InlineLinkingModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** What type of item to link to */
    linkTarget: LinkTarget;
    /** Called when user selects an item to link */
    onLink: (targetId: string, targetTitle: string) => void;
    /** Title of the source item (for display) */
    sourceTitle?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * InlineLinkingModal \u2014 Modal picker for linking workspace items to timeline events.
 * Provides search and select UI for connecting items to existing timeline entries.
 */
export function InlineLinkingModal({
    isOpen,
    onClose,
    linkTarget,
    onLink,
    sourceTitle,
}: InlineLinkingModalProps) {
    const { timeline } = useWorkspace();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // Get items based on link target
    const items = useMemo(() => {
        if (linkTarget === 'timeline') {
            return (timeline ?? []).map(t => ({
                id: t._id,
                title: t.title,
                subtitle: t.description,
                date: safeEventDate(t.eventDate),
                status: t.status,
            }));
        }
        // A9: Incident linking — not yet wired to workspace context.
        // Returns empty list; consumers should check linkTarget === 'incident'
        // and show a disabled state or hide the option until incidents are available.
        return [];
    }, [linkTarget, timeline]);

    // Filter by search
    const filteredItems = useMemo(() => {
        if (!searchQuery.trim()) return items;
        const q = searchQuery.toLowerCase();
        return items.filter(
            i => i.title.toLowerCase().includes(q) || i.subtitle?.toLowerCase().includes(q)
        );
    }, [items, searchQuery]);

    // N2: Reset state on every close — not just confirm
    const handleClose = () => {
        setSelectedId(null);
        setSearchQuery('');
        onClose();
    };

    const handleConfirm = () => {
        if (!selectedId) return;
        const item = items.find(i => i.id === selectedId);
        if (item) {
            onLink(selectedId, item.title);
            handleClose();
        }
    };

    const Icon = linkTarget === 'timeline' ? CalendarCheck : SealWarning;
    const label = linkTarget === 'timeline' ? 'Timeline Event' : 'Incident';

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        onClick={handleClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="inline-linking-title"
                        className="fixed inset-x-4 top-[20%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[480px] z-50 rounded-2xl border border-white/12 bg-[#0E1729]/98 backdrop-blur-xl shadow-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-[var(--accent-icy)]/10 border border-[var(--accent-icy)]/20 flex items-center justify-center">
                                    <LinkIcon size={16} weight="duotone" className="text-[var(--accent-icy)]" />
                                </div>
                                <div>
                                    <h3 id="inline-linking-title" className="text-[15px] font-semibold text-white">
                                        Link to {label}
                                    </h3>
                                    {sourceTitle && (
                                        <p className="text-[11px] text-white/35 mt-0.5 truncate max-w-[280px]">
                                            From: {sourceTitle}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={handleClose}
                                className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white/70 transition-all"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Search */}
                        <div className="px-6 py-3 border-b border-white/5">
                            <div className="relative">
                                <MagnifyingGlass size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" />
                                <input
                                    type="text"
                                    placeholder={`Search ${label.toLowerCase()}s...`}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-[var(--accent-icy)]/30 transition-all"
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* Items List */}
                        <div className="max-h-[300px] overflow-y-auto p-3">
                            {filteredItems.length === 0 ? (
                                <div className="text-center py-8">
                                    <Icon size={28} className="text-white/15 mx-auto mb-3" />
                                    <p className="text-[13px] text-white/30">
                                        {items.length === 0
                                            ? `No ${label.toLowerCase()}s yet`
                                            : 'No matches found'
                                        }
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {filteredItems.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}
                                            className={`
                                                w-full text-left px-4 py-3 rounded-xl transition-all duration-150
                                                ${item.id === selectedId
                                                    ? 'bg-[var(--accent-icy)]/10 border border-[var(--accent-icy)]/25'
                                                    : 'hover:bg-white/5 border border-transparent'
                                                }
                                            `}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <Icon
                                                        size={14}
                                                        weight={item.id === selectedId ? 'fill' : 'regular'}
                                                        className={item.id === selectedId ? 'text-[var(--accent-icy)]' : 'text-white/30'}
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="text-[13px] font-medium text-white/80 truncate">
                                                            {item.title}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            {item.date && (
                                                                <span className="text-[10px] text-white/25">
                                                                    {format(item.date, 'MMM d, yyyy')}
                                                                </span>
                                                            )}
                                                            {item.status && (
                                                                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                                                    item.status === 'confirmed'
                                                                        ? 'bg-[var(--accent-emerald)]/15 text-[var(--accent-emerald)]'
                                                                        : 'bg-white/5 text-white/20'
                                                                }`}>
                                                                    {item.status}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                {item.id === selectedId && (
                                                    <Check size={14} weight="bold" className="text-[var(--accent-icy)] flex-shrink-0" />
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-white/8 flex items-center justify-end gap-3">
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 rounded-xl text-[12px] font-semibold text-white/50 hover:text-white/70 hover:bg-white/5 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={!selectedId}
                                className="px-5 py-2 rounded-xl text-[12px] font-bold bg-[var(--accent-icy)]/20 text-[var(--accent-icy)] border border-[var(--accent-icy)]/20 hover:bg-[var(--accent-icy)]/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                Link
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
