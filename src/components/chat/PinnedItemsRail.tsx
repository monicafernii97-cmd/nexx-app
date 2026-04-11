'use client';

/**
 * PinnedItemsRail — Right-side workspace rail showing pinned items.
 *
 * Features:
 * - Always-visible mini sidebar (320px)
 * - Color-coded type badges for 9 pinnable classes
 * - Content preview with truncation
 * - Unpin action with confirmation
 * - Empty state with guidance
 */

import { motion, AnimatePresence } from 'framer-motion';
import { PushPin, X, CaretRight } from '@phosphor-icons/react';
import type { PinnableType } from '@/lib/integration/types';

// ---------------------------------------------------------------------------
// Type badge styling
// ---------------------------------------------------------------------------

const TYPE_STYLES: Record<PinnableType, { label: string; color: string }> = {
    key_fact: { label: 'Key Fact', color: 'bg-[var(--accent-icy)]/15 text-[var(--accent-icy)]' },
    strategy_point: { label: 'Strategy', color: 'bg-[var(--accent-icy)]/15 text-[var(--accent-icy)]' },
    good_faith_point: { label: 'Good Faith', color: 'bg-[var(--success-soft)]/15 text-[var(--success-soft)]' },
    strength_highlight: { label: 'Strength', color: 'bg-[var(--success-soft)]/15 text-[var(--success-soft)]' },
    risk_concern: { label: 'Risk', color: 'bg-[var(--warning-muted)]/15 text-[var(--warning-muted)]' },
    hearing_prep_point: { label: 'Hearing Prep', color: 'bg-[var(--support-violet)]/15 text-[var(--support-violet)]' },
    draft_snippet: { label: 'Draft', color: 'bg-[var(--accent-platinum)]/15 text-[var(--accent-platinum)]' },
    question_to_verify: { label: 'Verify', color: 'bg-[var(--warning-muted)]/15 text-[var(--warning-muted)]' },
    timeline_anchor: { label: 'Timeline', color: 'bg-[var(--accent-icy)]/15 text-[var(--accent-icy)]' },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PinnedItem {
    _id: string;
    type: PinnableType;
    title: string;
    content: string;
    createdAt: number;
}

interface PinnedItemsRailProps {
    items: PinnedItem[];
    onUnpin: (id: string) => void;
    /** Whether the rail is expanded (desktop) or collapsed (mobile) */
    isExpanded?: boolean;
    onToggle?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Workspace right rail showing pinned items with type badges, preview, and unpin actions. */
export function PinnedItemsRail({
    items,
    onUnpin,
    isExpanded = true,
    onToggle,
}: PinnedItemsRailProps) {
    if (!isExpanded) {
        return (
            <button
                type="button"
                onClick={onToggle}
                className="
                    flex flex-col items-center justify-center gap-2
                    w-10 h-full rounded-2xl
                    bg-[var(--surface-card)] border border-[var(--border-subtle)]
                    text-[var(--text-muted)] hover:text-[var(--accent-icy)]
                    transition-colors
                "
                aria-label="Expand pinned items"
            >
                <PushPin size={16} weight="bold" />
                {items.length > 0 && (
                    <span className="text-[10px] font-bold">{items.length}</span>
                )}
                <CaretRight size={12} />
            </button>
        );
    }

    return (
        <div className="
            w-80 flex-shrink-0 flex flex-col
            rounded-2xl border border-[var(--border-subtle)]
            bg-[var(--surface-card)]
            overflow-hidden
        ">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                    <PushPin size={16} className="text-[var(--accent-icy)]" weight="bold" />
                    <span className="text-sm font-semibold text-[var(--text-heading)]">
                        Pinned Items
                    </span>
                    {items.length > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--accent-icy)]/15 text-[var(--accent-icy)]">
                            {items.length}
                        </span>
                    )}
                </div>
                {onToggle && (
                    <button
                        type="button"
                        onClick={onToggle}
                        className="text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors p-0.5"
                        aria-label="Collapse pinned items"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {items.length === 0 ? (
                    <div className="text-center py-8 px-4">
                        <PushPin size={28} className="mx-auto text-[var(--text-muted)]/40 mb-3" />
                        <p className="text-xs text-[var(--text-muted)]">
                            No pinned items yet
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)]/60 mt-1">
                            Pin key facts, strategy points, or risks from any AI response
                        </p>
                    </div>
                ) : (
                    <AnimatePresence mode="popLayout">
                        {items.map((item) => {
                            const typeStyle = TYPE_STYLES[item.type];
                            return (
                                <motion.div
                                    key={item._id}
                                    layout
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.2 }}
                                    className="
                                        group rounded-xl p-3
                                        bg-[var(--surface-elevated)] border border-[var(--border-subtle)]
                                        hover:border-[var(--accent-icy)]/20
                                        transition-all duration-150
                                    "
                                >
                                    {/* Header: badge + unpin */}
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${typeStyle.color}`}>
                                            {typeStyle.label}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => onUnpin(item._id)}
                                            className="
                                                opacity-0 group-hover:opacity-100
                                                text-[var(--text-muted)] hover:text-[var(--critical-access)]
                                                transition-all duration-150 p-0.5
                                            "
                                            aria-label={`Unpin ${item.title}`}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>

                                    {/* Title */}
                                    <p className="text-xs font-semibold text-[var(--text-heading)] truncate">
                                        {item.title}
                                    </p>

                                    {/* Preview */}
                                    <p className="text-[10px] text-[var(--text-muted)] mt-1 line-clamp-2 leading-relaxed">
                                        {item.content}
                                    </p>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
}
