'use client';

/**
 * PinToWorkspaceModal — Pin an AI response section to the workspace rail.
 *
 * Flow: User clicks "Pin" → AI autofill runs → modal opens with cleaned
 * title + content → user can edit before saving → item appears in rail.
 *
 * If AI autofill fails, raw text is shown as fallback.
 * If user changes pin type, a "Reformat" button lets them re-run AI.
 *
 * State reset strategy: The inner `PinModalForm` is keyed on
 * `initialContent + initialTitle`. When the modal closes, AnimatePresence
 * unmounts it entirely, giving fresh state on reopen. If the seed props
 * change while the modal stays open, the key forces a remount.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, PushPin, Check, ArrowsClockwise } from '@phosphor-icons/react';
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
// Skeleton loader for autofill loading state
// ---------------------------------------------------------------------------

function FieldSkeleton({ lines = 1 }: { lines?: number }) {
    return (
        <div className="space-y-2 animate-pulse">
            {Array.from({ length: lines }).map((_, i) => (
                <div
                    key={i}
                    className="h-3.5 rounded-md bg-[var(--surface-elevated)]"
                    style={{ width: i === lines - 1 && lines > 1 ? '65%' : '100%' }}
                />
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Inner form (remounts via key when seed props change → fresh state)
// ---------------------------------------------------------------------------

/** Inner form component that owns all editing state. */
function PinModalForm({
    onPin,
    initialContent,
    initialTitle,
    isPinning,
    isAutofilling,
    onClose,
    onReformat,
}: {
    onPin: (type: PinnableType, title: string, content: string) => void;
    initialContent: string;
    initialTitle: string;
    isPinning: boolean;
    isAutofilling: boolean;
    onClose: () => void;
    onReformat?: (pinType: PinnableType) => void;
}) {
    const [selectedType, setSelectedType] = useState<PinnableType>('key_fact');
    const [title, setTitle] = useState(initialTitle);
    const [content, setContent] = useState(initialContent);

    // Track whether the user has changed the pin type since last autofill
    const [typeChangedSinceAutofill, setTypeChangedSinceAutofill] = useState(false);
    const lastAutofilledType = useRef<PinnableType>('key_fact');

    // Sync title/content when autofill result arrives (props change)
    useEffect(() => {
        if (!isAutofilling) {
            setTitle(initialTitle);
            setContent(initialContent);
            setTypeChangedSinceAutofill(false);
            lastAutofilledType.current = selectedType;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialTitle, initialContent, isAutofilling]);

    const handleTypeChange = (newType: PinnableType) => {
        setSelectedType(newType);
        if (newType !== lastAutofilledType.current) {
            setTypeChangedSinceAutofill(true);
        } else {
            setTypeChangedSinceAutofill(false);
        }
    };

    const handleReformat = () => {
        if (onReformat) {
            setTypeChangedSinceAutofill(false);
            lastAutofilledType.current = selectedType;
            onReformat(selectedType);
        }
    };

    const handlePin = () => {
        const finalTitle = title.trim() || PIN_OPTIONS.find(o => o.type === selectedType)?.label || 'Pinned Item';
        onPin(selectedType, finalTitle, content);
    };

    return (
        <>
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
                                onClick={() => handleTypeChange(option.type)}
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

                    {/* Reformat button — shown when user changes pin type */}
                    {typeChangedSinceAutofill && onReformat && !isAutofilling && (
                        <motion.button
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            type="button"
                            onClick={handleReformat}
                            className="
                                mt-2 inline-flex items-center gap-1.5 px-3 py-1.5
                                text-xs font-medium rounded-lg
                                text-[var(--accent-icy)] bg-[var(--accent-icy)]/8
                                hover:bg-[var(--accent-icy)]/15
                                border border-[var(--accent-icy)]/20
                                transition-all duration-150
                            "
                        >
                            <ArrowsClockwise size={13} weight="bold" />
                            Reformat for {PIN_OPTIONS.find(o => o.type === selectedType)?.label}
                        </motion.button>
                    )}
                </div>

                {/* Title input */}
                <div>
                    <label className="text-eyebrow block mb-1.5">Title</label>
                    {isAutofilling ? (
                        <div className="px-3 py-2.5">
                            <FieldSkeleton />
                        </div>
                    ) : (
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
                    )}
                </div>

                {/* Content textarea */}
                <div>
                    <label className="text-eyebrow block mb-1.5">Content</label>
                    {isAutofilling ? (
                        <div className="px-3 py-2.5">
                            <FieldSkeleton lines={3} />
                        </div>
                    ) : (
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
                    )}
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
                    disabled={!content.trim() || isPinning || isAutofilling}
                    className="
                        inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold
                        rounded-xl transition-all duration-150
                        bg-[var(--accent-icy)] text-white
                        hover:bg-[var(--accent-icy)]/90
                        disabled:opacity-40 disabled:cursor-not-allowed
                    "
                >
                    <Check size={14} weight="bold" />
                    {isPinning ? 'Pinning...' : isAutofilling ? 'Formatting...' : 'Pin'}
                </button>
            </div>
        </>
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PinToWorkspaceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPin: (type: PinnableType, title: string, content: string) => void;
    /** Pre-filled content (raw or AI-cleaned) */
    initialContent: string;
    /** Pre-filled title */
    initialTitle?: string;
    /** Whether pin is in progress */
    isPinning?: boolean;
    /** Whether AI autofill is running */
    isAutofilling?: boolean;
    /** Original raw source text (preserved for metadata) */
    rawSourceText?: string;
    /** Callback to re-run autofill with a different pin type */
    onReformat?: (pinType: PinnableType) => void;
}

/** Modal for pinning a response section to the workspace rail with editable title and type selection. */
export function PinToWorkspaceModal({
    isOpen,
    onClose,
    onPin,
    initialContent,
    initialTitle = '',
    isPinning = false,
    isAutofilling = false,
    onReformat,
}: PinToWorkspaceModalProps) {
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
                        <PinModalForm
                            key={`${initialContent}-${initialTitle}`}
                            onPin={onPin}
                            initialContent={initialContent}
                            initialTitle={initialTitle}
                            isPinning={isPinning}
                            isAutofilling={isAutofilling}
                            onClose={onClose}
                            onReformat={onReformat}
                        />
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
