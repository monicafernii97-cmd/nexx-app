'use client';

/**
 * AI Revision Sidebar — Conversational AI interface for revising
 * individual review items within the Review Hub.
 *
 * Calls /api/review/revise with streaming to provide real-time
 * revision responses. Maintains conversation history per item
 * for multi-turn refinement.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, CircleNotch, PencilSimple } from '@phosphor-icons/react';
import type { MappingReviewItem } from '@/lib/export-assembly/types/exports';

/** Props for the AI Revision Sidebar component. */
interface AIRevisionSidebarProps {
    /** The review item currently being revised. */
    item: MappingReviewItem;
    /** Called when the user closes the sidebar. */
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
 * AI Revision Sidebar — Conversational AI interface for revising individual
 * review items. Streams revisions from /api/review/revise and supports
 * multi-turn refinement with Accept/Reject controls.
 */
export default function AIRevisionSidebar({ item, onClose, onAcceptRevision }: AIRevisionSidebarProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingText, setStreamingText] = useState('');
    const feedEndRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Reset chat when the parent swaps to a different review item
    const prevItemIdRef = useRef(item.nodeId);
    useEffect(() => {
        if (item.nodeId !== prevItemIdRef.current) {
            prevItemIdRef.current = item.nodeId;
            setMessages([]);
            setStreamingText('');
            setInputValue('');
        }
    }, [item.nodeId]);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingText]);

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
        if (!inputValue.trim() || isStreaming) return;

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

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                sseBuffer += decoder.decode(value, { stream: true });
                const events = sseBuffer.split('\n\n');
                // Keep the last (possibly incomplete) chunk in the buffer
                sseBuffer = events.pop() ?? '';

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
                            // Stream complete — add the final AI message
                            const aiMsg: Message = {
                                id: (Date.now() + 1).toString(),
                                role: 'ai',
                                content: parsed.fullText || accumulated,
                                isRevisionProposal: true,
                            };
                            setMessages(prev => [...prev, aiMsg]);
                            setStreamingText('');
                        }
                    } catch (parseErr) {
                        // Re-throw real errors (e.g. error events from API)
                        if (parseErr instanceof Error && parseErr.message !== jsonStr) {
                            throw parseErr;
                        }
                        // Skip truly malformed JSON (shouldn't happen with buffer)
                    }
                }
            }
        } catch (err) {
            if ((err as Error).name === 'AbortError') return; // User cancelled

            console.error('[AIRevisionSidebar] Error:', err);
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

    return (
        <div className="flex flex-col h-full bg-[rgba(10,17,40,0.6)] backdrop-blur-xl">
            {/* Header */}
            <div className="shrink-0 px-5 py-4 border-b border-white/10 flex items-center justify-between bg-black/10">
                <div className="flex items-center gap-2">
                    <PencilSimple size={16} weight="bold" className="text-white/60" />
                    <h2 className="text-[13px] font-bold text-white/80 tracking-wide uppercase">
                        Section Revision
                    </h2>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        abortRef.current?.abort();
                        onClose();
                    }}
                    className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors text-white/40 hover:text-white"
                    aria-label="Close revision sidebar"
                >
                    <X size={14} weight="bold" />
                </button>
            </div>

            {/* Source text preview — shows the text that will be sent to AI */}
            <div className="px-5 py-3 border-b border-white/5 bg-black/10">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1">
                    Source
                </p>
                <p className="text-[12px] text-white/60 leading-relaxed line-clamp-3">
                    {item.userOverride?.editedText ?? item.originalText}
                </p>
            </div>

            {/* Chat Feed */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ scrollbarWidth: 'thin' }}>
                {messages.length === 0 && !isStreaming ? (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-50">
                        <PencilSimple size={28} weight="duotone" className="text-white/20" />
                        <div>
                            <p className="text-[13px] font-semibold text-white/70">How can I improve this section?</p>
                            <p className="text-[11px] text-white/40 mt-1 leading-relaxed">
                                E.g., &quot;Make it more formal&quot; or &quot;Add the statute citation&quot;
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
                                className={`flex flex-col max-w-[90%] ${msg.role === 'user' ? 'self-end items-end ml-auto' : 'self-start items-start mr-auto'}`}
                            >
                                {msg.role === 'user' ? (
                                    <div className="bg-[#1A4B9B] border border-[#2563EB]/30 rounded-2xl rounded-tr-sm px-4 py-3 shadow-lg">
                                        <p className="text-[13px] text-white/95 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                    </div>
                                ) : (
                                    <div className="rounded-2xl rounded-tl-sm px-4 py-3 shadow-lg border border-white/10 bg-[rgba(10,17,40,0.8)] w-full">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                                                <span className="text-[9px] font-bold text-white/70">AI</span>
                                            </div>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                                                {msg.isRevisionProposal ? 'Revised Draft' : 'Response'}
                                            </span>
                                        </div>
                                        <p className="text-[13px] text-white/80 leading-relaxed whitespace-pre-wrap">
                                            {msg.content}
                                        </p>

                                        {msg.isRevisionProposal && (
                                            <div className="mt-4 flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => onAcceptRevision(msg.content)}
                                                    className="text-[11px] px-4 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 transition-colors"
                                                >
                                                    Accept
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleReject(msg.id)}
                                                    className="text-[11px] px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 font-bold border border-white/10 transition-colors"
                                                >
                                                    Reject
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        ))}

                        {/* Streaming indicator with live text */}
                        {isStreaming && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="self-start w-full">
                                <div className="rounded-2xl rounded-tl-sm px-4 py-3 border border-white/10 bg-[rgba(10,17,40,0.8)]">
                                    <div className="flex items-center gap-2 mb-2">
                                        <CircleNotch size={14} className="text-white/40 animate-spin" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                                            Revising...
                                        </span>
                                    </div>
                                    {streamingText && (
                                        <p className="text-[13px] text-white/70 leading-relaxed whitespace-pre-wrap">
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
            <div className="p-4 border-t border-white/10 bg-black/20">
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
                        className="w-full bg-[rgba(255,255,255,0.03)] border border-white/10 rounded-xl px-4 py-3 pr-12 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-[#3B82F6]/50 min-h-[48px] max-h-[120px] resize-none transition-colors"
                        placeholder="Instruct AI to revise..."
                        rows={1}
                        disabled={isStreaming}
                    />
                    <button
                        type="button"
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isStreaming}
                        className="absolute right-2 top-2 w-8 h-8 rounded-lg bg-[#1A4B9B] disabled:opacity-50 disabled:bg-white/5 flex items-center justify-center hover:bg-[#2563EB] transition-colors"
                        aria-label="Send revision instruction"
                    >
                        <ArrowRight size={14} weight="bold" color="white" />
                    </button>
                </div>
            </div>
        </div>
    );
}
