'use client';

import { motion } from 'framer-motion';
import { 
    Calendar, 
    PushPin, 
    Notebook, 
    Trash,
    ShieldCheck,
    SealWarning,
    Strategy,
    Lightning,
    FileText,
    Checks,
    MagnifyingGlass
} from '@phosphor-icons/react';
import { format } from 'date-fns';
import type { PinnableType } from '@/lib/integration/types';
import type { SaveType } from '@/lib/ui-intelligence/types';

// ---------------------------------------------------------------------------
// Type-specific styling & icons
// ---------------------------------------------------------------------------

type ItemType = PinnableType | SaveType;

interface TypeConfig {
    label: string;
    color: string;
    icon: React.ElementType;
}

const TYPE_CONFIGS: Record<string, TypeConfig> = {
    // Pinned / Key Points
    key_fact: { label: 'Key Fact', color: 'accent-icy', icon: ShieldCheck },
    strategy_point: { label: 'Strategy', color: 'support-violet', icon: Strategy },
    risk_concern: { label: 'Risk', color: 'warning-muted', icon: SealWarning },
    strength_highlight: { label: 'Strength', color: 'success-soft', icon: Lightning },
    good_faith_point: { label: 'Good Faith', color: 'emerald', icon: Checks },
    hearing_prep_point: { label: 'Hearing Prep', color: 'champagne', icon: FileText },
    draft_snippet: { label: 'Draft', color: 'accent-platinum', icon: FileText },
    question_to_verify: { label: 'To Verify', color: 'info', icon: MagnifyingGlass },
    timeline_anchor: { label: 'Timeline', color: 'accent-icy', icon: Calendar },
    
    // Save Specific
    case_note: { label: 'Case Note', color: 'accent-platinum', icon: Notebook },
    incident_note: { label: 'Incident', color: 'emerald', icon: SealWarning },
    exhibit_note: { label: 'Exhibit', color: 'info', icon: FileText },
    procedure_note: { label: 'Procedure', color: 'support-violet', icon: Strategy },
    timeline_candidate: { label: 'Candidate', color: 'accent-icy', icon: Calendar },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ItemCardProps<TId extends string = string> {
    id: TId;
    type: ItemType;
    title: string;
    content: string;
    createdAt: number;
    onRemove: (id: TId) => Promise<void>;
    isPinned?: boolean;
    compact?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Shared ItemCard for workspace items (Memory, Pins, Timeline).
 * Uses ethereal design patterns with type-aware accents.
 * Generic over `TId` to preserve Convex branded ID types through `onRemove`.
 */
export function ItemCard<TId extends string>({
    id,
    type,
    title,
    content,
    createdAt,
    onRemove,
    isPinned = false,
    compact = false,
}: ItemCardProps<TId>) {
    const config = TYPE_CONFIGS[type] || { label: type, color: 'accent-platinum', icon: Notebook };
    const Icon = config.icon;
    const accentColor = `var(--${config.color})`;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`
                group relative glass-ethereal rounded-2xl border border-[var(--border-subtle)]
                hover:border-[rgba(255,255,255,0.2)] hover:bg-white/[0.03]
                transition-all duration-300 overflow-hidden
                ${compact ? 'p-3' : 'p-5'}
            `}
        >
            {/* Type Accent Glow */}
            <div 
                className="absolute top-0 left-0 w-1 h-full opacity-60 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: accentColor }}
            />

            {/* Header: Badge & Actions */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div 
                        className="w-6 h-6 rounded-lg flex items-center justify-center bg-white/5 border border-white/10"
                        style={{ color: accentColor }}
                    >
                        <Icon size={14} weight="duotone" />
                    </div>
                    <span 
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: accentColor }}
                    >
                        {config.label}
                    </span>
                    {isPinned && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[var(--accent-icy)]/10 text-[var(--accent-icy)] border border-[var(--accent-icy)]/20">
                            <PushPin size={8} weight="fill" />
                            <span className="text-[8px] font-bold uppercase">Pinned</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => onRemove(id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A1128]"
                        aria-label="Delete item"
                    >
                        <Trash size={14} weight="bold" />
                    </button>
                </div>
            </div>

            {/* Title */}
            <h4 className={`
                font-semibold text-white tracking-tight mb-2
                ${compact ? 'text-[13px] line-clamp-1' : 'text-[15px]'}
            `}>
                {title}
            </h4>

            {/* Content */}
            <p className={`
                text-white/60 leading-relaxed
                ${compact ? 'text-[11px] line-clamp-2' : 'text-[13px] line-clamp-4'}
            `}>
                {content}
            </p>

            {/* Footer */}
            {!compact && (
                <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-white/30">
                        <Calendar size={12} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                            {format(createdAt, 'MMM d, h:mm a')}
                        </span>
                    </div>
                </div>
            )}
        </motion.div>
    );
}
