'use client';

/**
 * Revision Modal — Conversational interface for revising
 * individual review items within the Review Hub.
 *
 * Calls /api/review/revise with streaming to provide real-time
 * revision responses. Maintains conversation history per item
 * for multi-turn refinement.
 */

import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, CircleNotch, ChatCircle } from '@phosphor-icons/react';
import type { MappingReviewItem } from '@/lib/export-assembly/types/exports';

/** Props for the Revision Modal component. */
interface RevisionModalProps {
    /** Whether the modal is currently visible. */
    isOpen: boolean;
    /** The review item currently being revised. */
    item: MappingReviewItem | null;
    /** Called when the user closes the modal. */
    onClose: () => void;
    /** Called when the user accepts a proposed revision, passing the revised text. */
    onAcceptRevision: (text: string) => void;
}

/** Chat message in the revision conversation feed. */
interface Message {
    id: string;
    role: 'user' | 'ai';
    content: string;
    /** Whether this message contains a revision proposal (enables Accept/Reject buttons). */
    isRevisionProposal?: boolean;
    /** Marks this message as a synthetic error (excluded from conversation history sent to API). */
    isError?: boolean;
}

/**
 * Revision Modal — Conversational interface for revising individual
 * review items. Streams revisions from /api/review/revise and supports
 * multi-turn refinement with Accept/Reject controls.
 */
export default function RevisionModal({ isOpen, item, onClose, onAcceptRevision }: RevisionModalProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingText, setStreamingText] = useState('');
    const feedEndRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const titleId = useId();
    const descriptionId = useId();

    // Reset chat when the parent swaps to a different review item or modal opens
    const prevItemIdRef = useRef(item?.nodeId);
    useEffect(() => {
        if (item?.nodeId !== prevItemIdRef.current || (!isOpen && prevItemIdRef.current)) {
            prevItemIdRef.current = item?.nodeId;
            setMessages([]);
            setStreamingText('');
            setInputValue('');
        }
    }, [item?.nodeId, isOpen]);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (isOpen) {
            feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, streamingText, isOpen]);

    // Cleanup abort on unmount
    useEffect(() => {
        return () => { abortRef.current?.abort(); };
    }, []);

    /** Build conversation history for multi-turn context, excluding synthetic error messages. */
    const buildConversationHistory = useCallback(() => {
        return messages
            .filter(m => !m.isError)
            .map(m => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.content,
            }));
    }, [messages]);

    const handleSend = useCallback(async () => {
        if (!inputValue.trim() || isStreaming || !item) return;

        const instruction = inputValue.trim();
        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: instruction,
        };
        setMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setIsStreaming(true);
        setStreamingText('');

        const abortController = new AbortController();
        abortRef.current = abortController;

        try {
            const sourceText = item.userOverride?.editedText ?? item.originalText;
            const res = await fetch('/api/review/revise', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    originalText: sourceText,
                    instruction,
                    sectionName: item.suggestedSections[0] ?? 'Section',
                    conversationHistory: buildConversationHistory(),
                }),
                signal: abortController.signal,
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errData.error || `HTTP ${res.status}`);
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            let accumulated = '';
            let sseBuffer = '';
            let sawDoneEvent = false;

            while (true) {
                const { done, value } = await reader.read();
                if (!done && value) {
                    sseBuffer += decoder.decode(value, { stream: true });
                }
                if (done) {
                    // Flush any remaining decoder buffer at EOF
                    sseBuffer += decoder.decode();
                }

                const parseBuffer = done ? `${sseBuffer}\n\n` : sseBuffer;
                const events = parseBuffer.split('\n\n');
                sseBuffer = done ? '' : events.pop() ?? '';

                for (const event of events) {
                    const line = event.trim();
                    if (!line.startsWith('data: ')) continue;
                    const jsonStr = line.slice(6);
                    try {
                        const parsed = JSON.parse(jsonStr);
                        if (parsed.error) {
                            throw new Error(parsed.error);
                        }
                        if (parsed.delta) {
                            accumulated += parsed.delta;
                            setStreamingText(accumulated);
                        }
                        if (parsed.done) {
                            sawDoneEvent = true;
                            // Stream complete — add the final message
                            const responseMsg: Message = {
                                id: (Date.now() + 1).toString(),
                                role: 'ai',
                                content: parsed.fullText || accumulated,
                                isRevisionProposal: true,
                            };
                            setMessages(prev => [...prev, responseMsg]);
                            setStreamingText('');
                        }
                    } catch (parseErr) {
                        // Only rethrow explicit API errors (thrown from parsed.error above).
                        // Skip JSON SyntaxErrors so truncated streams reach the partial-content path.
                        if (parseErr instanceof SyntaxError) continue;
                        throw parseErr;
                    }
                }
                if (done) break;
            }

            if (!sawDoneEvent) {
                if (accumulated.length > 0) {
                    // Stream ended without completion signal but has content — save it
                    const partialMsg: Message = {
                        id: (Date.now() + 1).toString(),
                        role: 'ai',
                        content: accumulated,
                        isRevisionProposal: true,
                    };
                    setMessages(prev => [...prev, partialMsg]);
                    setStreamingText('');
                } else {
                    throw new Error('Stream ended without a response');
                }
            }
        } catch (err) {
            if ((err as Error).name === 'AbortError') return; // User cancelled

            console.error('[RevisionModal] Error:', err);
            const errorMsg: Message = {
                id: (Date.now() + 2).toString(),
                role: 'ai',
                content: `I wasn't able to revise this section. ${(err as Error).message || 'Please try again.'}`,
                isError: true,
            };
            setMessages(prev => [...prev, errorMsg]);
            setStreamingText('');
        } finally {
            setIsStreaming(false);
            abortRef.current = null;
        }
    }, [inputValue, isStreaming, item, buildConversationHistory]);

    /** Remove a rejected revision from the chat feed. */
    const handleReject = useCallback((msgId: string) => {
        setMessages(prev => prev.filter(m => m.id !== msgId));
    }, []);

    const handleClose = () => {
        if (isStreaming) {
            abortRef.current?.abort();
        }
        onClose();
    };

    if (!isOpen || !item) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-[#020617]/80 backdrop-blur-sm"
                    onClick={isStreaming ? undefined : handleClose}
                />

                {/* Modal Container */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ type: 'spring', duration: 0.5, bounce: 0.3 }}
                    className="hyper-glass w-full max-w-[600px] h-[75vh] flex flex-col relative z-10 overflow-hidden"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                    aria-describedby={descriptionId}
                >
                    {/* Header */}
                    <div className="shrink-0 px-6 py-5 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                                <ChatCircle size={16} weight="bold" className="text-white/70" />
                            </div>
                            <h2 id={titleId} className="text-[18px] font-bold text-white tracking-tight font-[family-name:var(--font-playfair)]">
                                Section Revision
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={handleClose}
                            className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors text-white/40 hover:text-white border border-white/5 hover:border-white/10"
                            aria-label="Close revision modal"
                        >
                            <X size={14} weight="bold" />
                        </button>
                    </div>

                    {/* Source text preview */}
                    <div className="px-6 py-4 border-b border-white/5 bg-black/20 shrink-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">
                            Source Document
                        </p>
                        <p id={descriptionId} className="text-[13px] text-white/60 leading-relaxed font-[family-name:var(--font-outfit)] line-clamp-3">
                            {item.userOverride?.editedText ?? item.originalText}
                        </p>
                    </div>

                    {/* Chat Feed */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6" style={{ scrollbarWidth: 'thin' }}>
                        {messages.length === 0 && !isStreaming ? (
                            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-50">
                                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                                    <ChatCircle size={24} weight="duotone" className="text-white/40" />
                                </div>
                                <div>
                                    <p className="text-[14px] font-semibold text-white/70 font-[family-name:var(--font-outfit)]">How can I improve this section?</p>
                                    <p className="text-[12px] text-white/40 mt-1.5 leading-relaxed font-[family-name:var(--font-outfit)]">
                                        E.g., &quot;Make it more formal&quot; or &quot;Rewrite to focus on jurisdiction&quot;
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <AnimatePresence initial={false}>
                                {messages.map(msg => (
                                    <motion.div
                                        key={msg.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'self-end items-end ml-auto' : 'self-start items-start mr-auto'}`}
                                    >
                                        {msg.role === 'user' ? (
                                            <div className="bg-white/10 border border-white/20 rounded-2xl rounded-tr-sm px-5 py-3.5 shadow-lg">
                                                <p className="text-[13px] text-white/95 leading-relaxed whitespace-pre-wrap font-[family-name:var(--font-outfit)]">{msg.content}</p>
                                            </div>
                                        ) : (
                                            <div className="rounded-2xl rounded-tl-sm px-5 py-4 shadow-lg border border-white/5 bg-black/40 w-full">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                                                        {msg.isRevisionProposal ? 'Revised Draft' : 'Response'}
                                                    </span>
                                                </div>
                                                <p className="text-[13px] text-white/80 leading-relaxed whitespace-pre-wrap font-[family-name:var(--font-outfit)]">
                                                    {msg.content}
                                                </p>

                                                {msg.isRevisionProposal && (
                                                    <div className="mt-5 flex gap-2 pt-4 border-t border-white/5">
                                                        <button
                                                            type="button"
                                                            onClick={() => onAcceptRevision(msg.content)}
                                                            className="text-[12px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold border border-white/20 transition-colors"
                                                        >
                                                            Accept Revision
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleReject(msg.id)}
                                                            className="text-[12px] px-4 py-2 rounded-xl bg-transparent hover:bg-white/5 text-white/50 hover:text-white/80 font-semibold transition-colors"
                                                        >
                                                            Discard
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </motion.div>
                                ))}

                                {/* Streaming indicator with live text */}
                                {isStreaming && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="self-start w-full max-w-[85%]">
                                        <div className="rounded-2xl rounded-tl-sm px-5 py-4 border border-white/5 bg-black/40">
                                            <div className="flex items-center gap-2 mb-3">
                                                <CircleNotch size={14} className="text-white/40 animate-spin" />
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                                                    Revising...
                                                </span>
                                            </div>
                                            {streamingText && (
                                                <p className="text-[13px] text-white/70 leading-relaxed whitespace-pre-wrap font-[family-name:var(--font-outfit)]">
                                                    {streamingText}
                                                </p>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        )}
                        <div ref={feedEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-5 px-6 border-t border-white/5 bg-black/20 shrink-0">
                        <div className="relative">
                            <textarea
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 pr-12 text-[13px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-white/30 min-h-[50px] max-h-[120px] resize-none transition-colors font-[family-name:var(--font-outfit)]"
                                placeholder="Instruct revision..."
                                rows={1}
                                disabled={isStreaming}
                            />
                            <button
                                type="button"
                                onClick={handleSend}
                                disabled={!inputValue.trim() || isStreaming}
                                className="absolute right-2 top-2 bottom-2 w-10 rounded-lg bg-white/10 disabled:opacity-40 disabled:bg-white/5 flex items-center justify-center hover:bg-white/20 transition-colors border border-white/10"
                                aria-label="Send revision instruction"
                            >
                                <ArrowRight size={14} weight="bold" className="text-white" />
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
