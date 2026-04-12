'use client';

/**
 * PinToWorkspaceModal — Pin an AI response section to the workspace rail.
 *
 * Flow: User clicks "Pin" → modal with editable title + content →
 * confirm → item instantly appears in right rail (optimistic) →
 * persists to casePins backend.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, PushPin, Check } from '@phosphor-icons/react';
import type { PinnableType } from '@/lib/integration/types';

// ---------------------------------------------------------------------------
// Pin type options
// ---------------------------------------------------------------------------

interface PinOption {
    type: PinnableType;
    label: string;
    emoji: string;
}

const PIN_OPTIONS: PinOption[] = [
    { type: 'key_fact', label: 'Key Fact', emoji: '📌' },
    { type: 'strategy_point', label: 'Strategy Point', emoji: '♟️' },
    { type: 'good_faith_point', label: 'Good-Faith Point', emoji: '🤝' },
    { type: 'strength_highlight', label: 'Strength', emoji: '💪' },
    { type: 'risk_concern', label: 'Risk / Concern', emoji: '⚠️' },
    { type: 'hearing_prep_point', label: 'Hearing Prep', emoji: '🏛️' },
    { type: 'draft_snippet', label: 'Draft Snippet', emoji: '✍️' },
    { type: 'question_to_verify', label: 'Question to Verify', emoji: '❓' },
    { type: 'timeline_anchor', label: 'Timeline Anchor', emoji: '📅' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PinToWorkspaceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPin: (type: PinnableType, title: string, content: string) => void;
    /** Pre-filled content */
    initialContent: string;
    /** Pre-filled title */
    initialTitle?: string;
    /** Whether pin is in progress */
    isPinning?: boolean;
}

/** Modal for pinning a response section to the workspace rail with editable title and type selection. */
export function PinToWorkspaceModal({
    isOpen,
    onClose,
    onPin,
    initialContent,
    initialTitle = '',
    isPinning = false,
}: PinToWorkspaceModalProps) {
    const [selectedType, setSelectedType] = useState<PinnableType>('key_fact');
    const [title, setTitle] = useState(initialTitle);
    const [content, setContent] = useState(initialContent);

    // Reset form state when modal opens or seed props change
    useEffect(() => {
        if (isOpen) {
            setSelectedType('key_fact');
            setTitle(initialTitle);
            setContent(initialContent);
        }
    }, [isOpen, initialContent, initialTitle]);

    const handlePin = () => {
        const finalTitle = title.trim() || PIN_OPTIONS.find(o => o.type === selectedType)?.label || 'Pinned Item';
        onPin(selectedType, finalTitle, content);
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
                            w-full max-w-md max-h-[85vh] overflow-hidden
                            rounded-3xl border border-[var(--border-subtle)]
                            bg-[var(--surface-card)] shadow-2xl
                        "
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
                            <div className="flex items-center gap-2">
                                <PushPin size={20} className="text-[var(--accent-icy)]" weight="bold" />
                                <h2 className="text-headline text-lg text-[var(--text-heading)]">Pin to Workspace</h2>
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
                        <div className="px-6 py-4 space-y-4 overflow-y-auto max-h-[60vh]">
                            {/* Pin type selector */}
                            <div>
                                <label className="text-eyebrow block mb-2">Pin Type</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {PIN_OPTIONS.map((option) => (
                                        <button
                                            key={option.type}
                                            type="button"
                                            onClick={() => setSelectedType(option.type)}
                                            className={`
                                                inline-flex items-center gap-1 px-2.5 py-1.5
                                                text-xs font-medium rounded-full
                                                border transition-all duration-150
                                                ${selectedType === option.type
                                                    ? 'border-[var(--accent-icy)] bg-[var(--accent-icy)]/10 text-[var(--accent-icy)]'
                                                    : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--accent-icy)]/30'
                                                }
                                            `}
                                        >
                                            <span>{option.emoji}</span>
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Title input */}
                            <div>
                                <label className="text-eyebrow block mb-1.5">Title</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Enter a title..."
                                    className="
                                        w-full px-3 py-2 text-sm rounded-xl
                                        bg-[var(--surface-elevated)] text-[var(--text-body)]
                                        border border-[var(--border-subtle)]
                                        focus:outline-none focus:border-[var(--accent-icy)]/50
                                        placeholder:text-[var(--text-muted)]
                                    "
                                />
                            </div>

                            {/* Content textarea */}
                            <div>
                                <label className="text-eyebrow block mb-1.5">Content</label>
                                <textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    rows={4}
                                    className="
                                        w-full px-3 py-2 text-sm rounded-xl resize-none
                                        bg-[var(--surface-elevated)] text-[var(--text-body)]
                                        border border-[var(--border-subtle)]
                                        focus:outline-none focus:border-[var(--accent-icy)]/50
                                        placeholder:text-[var(--text-muted)]
                                    "
                                />
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
                                onClick={handlePin}
                                disabled={!content.trim() || isPinning}
                                className="
                                    inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold
                                    rounded-xl transition-all duration-150
                                    bg-[var(--accent-icy)] text-white
                                    hover:bg-[var(--accent-icy)]/90
                                    disabled:opacity-40 disabled:cursor-not-allowed
                                "
                            >
                                <Check size={14} weight="bold" />
                                {isPinning ? 'Pinning...' : 'Pin'}
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
