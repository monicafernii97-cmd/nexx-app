'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { 
    Calendar, 
    PushPin, 
    Notebook, 
    Trash,
    PencilSimple,
    Check,
    X,
    ShieldCheck,
    SealWarning,
    Strategy,
    Lightning,
    FileText,
    Checks,
    MagnifyingGlass,
    ChartBar,
    BookOpen,
} from '@phosphor-icons/react';
import { format } from 'date-fns';
import { SourceBadge } from '@/components/workspace/SourceBadge';
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

    // AI-generated analysis types
    pattern_analysis: { label: 'Pattern Analysis', color: 'accent-emerald', icon: ChartBar },
    narrative_synthesis: { label: 'Case Narrative', color: 'support-violet', icon: BookOpen },
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
    onUpdate?: (id: TId, updates: { title?: string; content?: string }) => Promise<void>;
    isPinned?: boolean;
    compact?: boolean;
    /** If present, shows a SourceBadge linking to the origin conversation */
    sourceConversationId?: string;
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
    onUpdate,
    isPinned = false,
    compact = false,
    sourceConversationId,
}: ItemCardProps<TId>) {
    const config = TYPE_CONFIGS[type] || { label: type, color: 'accent-platinum', icon: Notebook };
    const Icon = config.icon;
    const accentColor = `var(--${config.color})`;
    const [isEditing, setIsEditing] = useState(false);
    const [draftTitle, setDraftTitle] = useState(title);
    const [draftContent, setDraftContent] = useState(content);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    /** Open edit mode with the latest persisted values. */
    const handleStartEdit = () => {
        setDraftTitle(title);
        setDraftContent(content);
        setSaveError(null);
        setIsEditing(true);
    };

    /** Discard unsaved edits and restore the latest persisted values. */
    const handleCancelEdit = () => {
        setDraftTitle(title);
        setDraftContent(content);
        setSaveError(null);
        setIsEditing(false);
    };

    /** Persist edits while keeping the editor open if the update fails. */
    const handleSaveEdit = async () => {
        if (!onUpdate || isSaving) return;
        setIsSaving(true);
        setSaveError(null);
        try {
            await onUpdate(id, {
                title: draftTitle.trim() || title,
                content: draftContent.trim() || content,
            });
            setIsEditing(false);
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Could not save changes.');
        } finally {
            setIsSaving(false);
        }
    };

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

                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                    {onUpdate && (
                        <button
                            onClick={handleStartEdit}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A1128]"
                            aria-label="Edit item"
                        >
                            <PencilSimple size={14} weight="bold" />
                        </button>
                    )}
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
            {isEditing ? (
                <input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    className="mb-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] font-semibold text-white outline-none focus:border-[var(--support-violet)]/50"
                    aria-label="Item title"
                />
            ) : (
                <h4 className={`
                    font-semibold text-white tracking-tight mb-2
                    ${compact ? 'text-[13px] line-clamp-1' : 'text-[15px]'}
                `}>
                    {title}
                </h4>
            )}

            {/* Content */}
            {isEditing ? (
                <div className="space-y-3">
                    <textarea
                        value={draftContent}
                        onChange={(event) => setDraftContent(event.target.value)}
                        rows={compact ? 4 : 6}
                        className="w-full resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] leading-relaxed text-white/80 outline-none focus:border-[var(--support-violet)]/50"
                        aria-label="Item content"
                    />
                    {saveError && (
                        <p className="text-[11px] leading-snug text-red-300/80">
                            {saveError}
                        </p>
                    )}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleSaveEdit}
                            disabled={isSaving}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 disabled:opacity-50"
                        >
                            <Check size={12} weight="bold" />
                            {isSaving ? 'Saving' : 'Save'}
                        </button>
                        <button
                            type="button"
                            onClick={handleCancelEdit}
                            disabled={isSaving}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/45 disabled:opacity-50"
                        >
                            <X size={12} weight="bold" />
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <p className={`
                    text-white/60 leading-relaxed
                    ${compact ? 'text-[11px] line-clamp-2' : 'text-[13px] line-clamp-4'}
                `}>
                    {content}
                </p>
            )}

            {/* Footer */}
            {!compact && (
                <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-white/30">
                        <Calendar size={12} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                            {format(createdAt, 'MMM d, h:mm a')}
                        </span>
                    </div>
                    {sourceConversationId && (
                        <SourceBadge source="chat" conversationId={sourceConversationId} compact />
                    )}
                </div>
            )}
        </motion.div>
    );
}
