'use client';

import { motion } from 'framer-motion';
import { Copy, Check, Sparkle, ArrowsClockwise, PencilSimple, X, PaperPlaneRight } from '@phosphor-icons/react';
import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export type ChatTheme = 'dark' | 'light';

interface MessageBubbleProps {
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
    messageId?: string;
    theme?: ChatTheme;
    /** Called when user clicks Retry on an assistant message. */
    onRetry?: () => void;
    /** Called when user saves an edited message — passes new content. */
    onEdit?: (newContent: string) => void;
}

// ── Shared action button (declared OUTSIDE render to satisfy react-hooks/static-components) ──

interface ActionButtonProps {
    onClick: () => void;
    label: string;
    isLight: boolean;
    children: React.ReactNode;
}

/** Small icon-only action button used in message toolbars (copy, retry, edit). */
function ActionButton({ onClick, label, isLight, children }: ActionButtonProps) {
    return (
        <button
            className={`${isLight
                ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                : 'text-white/40 hover:text-white/80 hover:bg-white/10'
                } transition-colors flex items-center gap-1.5 p-1.5 rounded-md`}
            onClick={onClick}
            aria-label={label}
        >
            {children}
        </button>
    );
}

/** Chat message bubble with ChatGPT-style actions (copy, retry, edit) and light/dark theme support. */
export default function MessageBubble({
    role,
    content,
    isStreaming,
    theme = 'dark',
    onRetry,
    onEdit,
}: MessageBubbleProps) {
    const [copied, setCopied] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(content);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const editTextareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        return () => {
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        };
    }, []);

    // Auto-resize textarea when editing
    useEffect(() => {
        if (isEditing && editTextareaRef.current) {
            editTextareaRef.current.style.height = '0px';
            editTextareaRef.current.style.height = `${editTextareaRef.current.scrollHeight}px`;
            editTextareaRef.current.focus();
        }
    }, [isEditing, editContent]);

    /** Copy message content to the clipboard. */
    const handleCopy = useCallback(async () => {
        if (!window.isSecureContext || !navigator.clipboard?.writeText) return;
        try {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
            copyTimerRef.current = setTimeout(() => {
                setCopied(false);
                copyTimerRef.current = null;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }, [content]);

    /** Enter inline edit mode, pre-filling the textarea with the current message content. */
    const handleStartEdit = useCallback(() => {
        setEditContent(content);
        setIsEditing(true);
    }, [content]);

    /** Cancel editing and restore original content. */
    const handleCancelEdit = useCallback(() => {
        setIsEditing(false);
        setEditContent(content);
    }, [content]);

    /** Save the edited content and trigger a re-generation via the parent callback. */
    const handleSaveEdit = useCallback(() => {
        const trimmed = editContent.trim();
        if (!trimmed || trimmed === content) {
            handleCancelEdit();
            return;
        }
        onEdit?.(trimmed);
        setIsEditing(false);
    }, [editContent, content, onEdit, handleCancelEdit]);

    /** Handle keyboard shortcuts in the edit textarea (Enter to save, Escape to cancel). */
    const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSaveEdit();
        }
        if (e.key === 'Escape') {
            handleCancelEdit();
        }
    }, [handleSaveEdit, handleCancelEdit]);

    const isLight = theme === 'light';

    // Responsive visibility: always visible on mobile, hover-reveal on desktop
    const actionBarClass = 'flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity';

    // ── USER MESSAGE ──
    if (role === 'user') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="flex gap-3 w-full justify-end px-4 py-4 group"
            >
                <div className="flex flex-col items-end max-w-[80%]">
                    {isEditing ? (
                        /* ── Inline Edit Mode ── */
                        <div className={`w-full rounded-2xl p-3 border ${isLight
                            ? 'bg-white border-gray-200 shadow-sm'
                            : 'bg-white/10 border-white/20 backdrop-blur-sm'
                            }`}>
                            <textarea
                                ref={editTextareaRef}
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                onKeyDown={handleEditKeyDown}
                                aria-label="Edit message"
                                className={`w-full resize-none border-none outline-none text-[15px] leading-relaxed font-medium bg-transparent min-w-[280px] ${isLight ? 'text-gray-900 placeholder:text-gray-400' : 'text-white placeholder:text-white/40'
                                    }`}
                                style={{ caretColor: isLight ? '#2563EB' : '#60A5FA' }}
                            />
                            <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-current/10">
                                <button
                                    onClick={handleCancelEdit}
                                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isLight
                                        ? 'text-gray-500 hover:bg-gray-100'
                                        : 'text-white/60 hover:bg-white/10'
                                        }`}
                                >
                                    <X size={14} weight="bold" /> Cancel
                                </button>
                                <button
                                    onClick={handleSaveEdit}
                                    disabled={!editContent.trim() || editContent.trim() === content}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <PaperPlaneRight size={14} weight="fill" /> Send
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* ── Normal Display ── */
                        <>
                            <div className={`rounded-3xl px-5 py-3 shadow-sm font-medium text-[15px] leading-relaxed whitespace-pre-wrap ${isLight
                                ? 'bg-gray-100 text-gray-900'
                                : 'bg-white/10 backdrop-blur-sm border border-white/15 text-white'
                                }`}>
                                {content}
                            </div>
                            {/* User action bar */}
                            <div className={`${actionBarClass} mt-1`}>
                                <ActionButton onClick={handleCopy} label={copied ? 'Copied' : 'Copy message'} isLight={isLight}>
                                    {copied ? <Check size={14} weight="bold" className="text-emerald-400" /> : <Copy size={14} weight="regular" />}
                                </ActionButton>
                                {onEdit && (
                                    <ActionButton onClick={handleStartEdit} label="Edit message" isLight={isLight}>
                                        <PencilSimple size={14} weight="regular" />
                                    </ActionButton>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </motion.div>
        );
    }

    // ── ASSISTANT MESSAGE ──
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="flex gap-4 w-full justify-start px-4 sm:px-6 py-4 group"
        >
            <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-1 shadow-sm border ${isLight
                ? 'bg-gradient-to-br from-blue-500 to-indigo-600 border-indigo-400/20'
                : 'bg-gradient-to-br from-blue-600 to-indigo-700 border-indigo-500/20'
                }`}>
                <Sparkle size={16} weight="fill" className="text-white" />
            </div>

            <div className="flex-1 max-w-4xl min-w-0 pr-4">
                <div className={`text-[15px] leading-7 font-normal prose max-w-none w-full break-words ${isLight
                    ? 'text-gray-800 prose-blue'
                    : 'text-white/90 prose-invert'
                    }`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {content + (isStreaming ? ' ▍' : '')}
                    </ReactMarkdown>
                </div>

                {/* Assistant action bar */}
                {!isStreaming && (
                    <div className={`${actionBarClass} mt-2`}>
                        <ActionButton onClick={handleCopy} label={copied ? 'Copied' : 'Copy response'} isLight={isLight}>
                            {copied ? <Check size={14} weight="bold" className="text-emerald-400" /> : <Copy size={14} weight="regular" />}
                        </ActionButton>
                        {onRetry && (
                            <ActionButton onClick={onRetry} label="Retry response" isLight={isLight}>
                                <ArrowsClockwise size={14} weight="regular" />
                            </ActionButton>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
