'use client';

/**
 * SaveToCaseModal — Modal for saving a response section to case memory.
 *
 * Flow: User clicks "Save to Case" → modal shows suggested save types
 * with explanations → recommended option highlighted → user selects →
 * saved → toast confirms with destination link.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, FloppyDisk } from '@phosphor-icons/react';
import type { SaveType } from '@/lib/ui-intelligence/types';

// ---------------------------------------------------------------------------
// Save type options
// ---------------------------------------------------------------------------

interface SaveOption {
    type: SaveType;
    label: string;
    description: string;
}

const SAVE_OPTIONS: SaveOption[] = [
    { type: 'case_note', label: 'Case Note', description: 'General observation or note about your case' },
    { type: 'key_fact', label: 'Key Fact', description: 'Important factual detail for your case' },
    { type: 'strategy_point', label: 'Strategy Point', description: 'Strategic insight for your case approach' },
    { type: 'good_faith_point', label: 'Good-Faith Point', description: 'Demonstrates cooperation and reasonableness' },
    { type: 'risk_concern', label: 'Risk / Concern', description: 'Potential risk to be aware of and mitigate' },
    { type: 'strength_highlight', label: 'Strength', description: 'A strong point in your favor' },
    { type: 'draft_snippet', label: 'Draft Snippet', description: 'Reusable language for documents' },
    { type: 'timeline_candidate', label: 'Timeline Entry', description: 'Event to add to your case timeline' },
    { type: 'incident_note', label: 'Incident Note', description: 'Documentation of a specific incident' },
    { type: 'exhibit_note', label: 'Exhibit Note', description: 'Reference to a court exhibit' },
    { type: 'procedure_note', label: 'Procedure Note', description: 'Jurisdiction-specific procedural detail' },
    { type: 'question_to_verify', label: 'Question to Verify', description: 'Something to confirm or research further' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SaveToCaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (type: SaveType, title: string) => void;
    /** Content being saved (for preview) */
    content: string;
    /** Recommended save type from AI analysis */
    recommendedType?: SaveType;
    /** Whether save is in progress */
    isSaving?: boolean;
}

/** Modal for selecting a save classification when saving response content to case memory. */
export function SaveToCaseModal({
    isOpen,
    onClose,
    onSave,
    content,
    recommendedType,
    isSaving = false,
}: SaveToCaseModalProps) {
    const [selectedType, setSelectedType] = useState<SaveType | null>(recommendedType ?? null);
    const [title, setTitle] = useState('');

    const handleSave = () => {
        if (!selectedType) return;
        const finalTitle = title.trim() || SAVE_OPTIONS.find(o => o.type === selectedType)?.label || 'Saved Item';
        onSave(selectedType, finalTitle);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="
                            fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                            w-full max-w-lg max-h-[85vh] overflow-hidden
                            rounded-3xl border border-[var(--border-subtle)]
                            bg-[var(--surface-card)] shadow-2xl
                        "
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
                            <div className="flex items-center gap-2">
                                <FloppyDisk size={20} className="text-[var(--accent-icy)]" weight="bold" />
                                <h2 className="text-headline text-lg text-[var(--text-heading)]">Save to Case</h2>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors p-1"
                                aria-label="Close modal"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="px-6 py-4 overflow-y-auto max-h-[60vh] space-y-4">
                            {/* Title input */}
                            <div>
                                <label className="text-eyebrow block mb-1.5">Title (optional)</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Auto-generated if blank..."
                                    className="
                                        w-full px-3 py-2 text-sm rounded-xl
                                        bg-[var(--surface-elevated)] text-[var(--text-body)]
                                        border border-[var(--border-subtle)]
                                        focus:outline-none focus:border-[var(--accent-icy)]/50
                                        placeholder:text-[var(--text-muted)]
                                    "
                                />
                            </div>

                            {/* Content preview */}
                            <div>
                                <label className="text-eyebrow block mb-1.5">Content Preview</label>
                                <div className="px-3 py-2 text-xs text-[var(--text-muted)] bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)] line-clamp-3">
                                    {content}
                                </div>
                            </div>

                            {/* Save type grid */}
                            <div>
                                <label className="text-eyebrow block mb-2">Save As</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {SAVE_OPTIONS.map((option) => {
                                        const isSelected = selectedType === option.type;
                                        const isRecommended = recommendedType === option.type;
                                        return (
                                            <button
                                                key={option.type}
                                                type="button"
                                                onClick={() => setSelectedType(option.type)}
                                                className={`
                                                    text-left p-3 rounded-xl border transition-all duration-150
                                                    ${isSelected
                                                        ? 'border-[var(--accent-icy)] bg-[var(--accent-icy)]/10'
                                                        : 'border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:border-[var(--accent-icy)]/30'
                                                    }
                                                `}
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`text-xs font-semibold ${isSelected ? 'text-[var(--accent-icy)]' : 'text-[var(--text-heading)]'}`}>
                                                        {option.label}
                                                    </span>
                                                    {isRecommended && (
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--accent-icy)]/20 text-[var(--accent-icy)]">
                                                            REC
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-tight">
                                                    {option.description}
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--border-subtle)]">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors rounded-xl"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={!selectedType || isSaving}
                                className="
                                    inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold
                                    rounded-xl transition-all duration-150
                                    bg-[var(--accent-icy)] text-white
                                    hover:bg-[var(--accent-icy)]/90
                                    disabled:opacity-40 disabled:cursor-not-allowed
                                "
                            >
                                <Check size={14} weight="bold" />
                                {isSaving ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
