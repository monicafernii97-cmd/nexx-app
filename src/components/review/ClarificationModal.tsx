'use client';

/**
 * Clarification Modal — GenSpark-style interceptor dialog.
 *
 * Appears when the parser detects missing structure (no headings,
 * low-confidence classifications, or entirely unclassified items).
 * Provides smart options with additional details input.
 *
 * Now fully functional:
 * - "Generate titles" calls /api/review/revise to suggest structure
 * - "Go to NexChat" redirects to the chat interface
 * - "Other" allows free-form instructions
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { WarningCircle, ArrowRight, CircleNotch, Info } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';

export type ClarificationAction = 'generate_titles' | 'go_to_nexchat' | 'other';

interface ClarificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Called when the user picks an action. For 'generate_titles', resolvedText contains the AI response. */
    onContinue: (action: ClarificationAction, details: string, resolvedText?: string) => void;
    /** The raw unstructured text for context (used when generating titles). */
    rawDocumentText?: string;
}

export default function ClarificationModal({ isOpen, onClose, onContinue, rawDocumentText }: ClarificationModalProps) {
    const [selectedAction, setSelectedAction] = useState<ClarificationAction>('generate_titles');
    const [details, setDetails] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    if (!isOpen) return null;

    const handleContinue = async () => {
        setError(null);

        // Option 2: Go to NexChat — just redirect
        if (selectedAction === 'go_to_nexchat') {
            onClose();
            router.push('/chat');
            return;
        }

        // Option 1 & 3: Generate titles / Other — call the AI
        if (selectedAction === 'generate_titles' || selectedAction === 'other') {
            setIsProcessing(true);
            try {
                const instruction = selectedAction === 'generate_titles'
                    ? `Analyze this unstructured legal document text and add appropriate section headings and structure. Break it into logical sections with Roman numeral headings (I, II, III, etc.) that follow standard legal document conventions. ${details ? `Additional instructions: ${details}` : ''}`
                    : details || 'Please help restructure this document.';

                const res = await fetch('/api/review/revise', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        originalText: rawDocumentText || '(No document text available)',
                        instruction,
                        sectionName: 'Full Document',
                    }),
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
                    throw new Error(errData.error || `HTTP ${res.status}`);
                }

                // Read the streaming response
                const reader = res.body?.getReader();
                if (!reader) throw new Error('No response body');

                const decoder = new TextDecoder();
                let fullText = '';

                let sseBuffer = '';
                let streamError: string | null = null;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    sseBuffer += decoder.decode(value, { stream: true });
                    const events = sseBuffer.split('\n\n');
                    sseBuffer = events.pop() ?? '';

                    for (const event of events) {
                        const line = event.trim();
                        if (!line.startsWith('data: ')) continue;
                        try {
                            const parsed = JSON.parse(line.slice(6));
                            if (parsed.error) {
                                streamError = parsed.error;
                                break;
                            }
                            if (parsed.done) {
                                fullText = parsed.fullText || fullText;
                            } else if (parsed.delta) {
                                fullText += parsed.delta;
                            }
                        } catch {
                            // Skip malformed chunks
                        }
                    }
                    if (streamError) break;
                }

                if (streamError) {
                    throw new Error(streamError);
                }

                onContinue(selectedAction, details, fullText);
            } catch (err) {
                console.error('[ClarificationModal] Error:', err);
                setError((err as Error).message || 'Something went wrong. Please try again.');
            } finally {
                setIsProcessing(false);
            }
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-[#020617]/80 backdrop-blur-sm"
                    onClick={isProcessing ? undefined : onClose}
                />

                {/* Modal Container */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ type: 'spring', duration: 0.5, bounce: 0.3 }}
                    className="hyper-glass w-full max-w-[500px] flex flex-col relative z-10"
                >
                    {/* Header */}
                    <div className="p-6 pb-4 border-b border-white/5">
                        <div className="flex items-center gap-3 mb-2">
                            <Info size={20} weight="fill" className="text-[#38BDF8]" />
                            <h2 className="text-[16px] font-bold text-white tracking-tight">Clarification Needed</h2>
                        </div>
                        <p className="text-[14px] text-white/70 leading-relaxed">
                            This document appears to be missing structured sections or titles. How would you like to proceed?
                        </p>
                    </div>

                    {/* Body: Options */}
                    <div className="p-6 space-y-3">
                        <OptionCard
                            title="Generate titles and structure for me"
                            description="AI will analyze the text and add section headings"
                            selected={selectedAction === 'generate_titles'}
                            onClick={() => setSelectedAction('generate_titles')}
                            disabled={isProcessing}
                        />
                        <OptionCard
                            title="Go to NexChat for a full court-ready draft"
                            description="Open the AI chat for in-depth document creation"
                            selected={selectedAction === 'go_to_nexchat'}
                            onClick={() => setSelectedAction('go_to_nexchat')}
                            disabled={isProcessing}
                        />
                        <OptionCard
                            title="Other (specify below)"
                            description="Provide custom instructions for restructuring"
                            selected={selectedAction === 'other'}
                            onClick={() => setSelectedAction('other')}
                            disabled={isProcessing}
                        />

                        {/* Additional Details Input */}
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            className="pt-2 overflow-hidden"
                        >
                            <textarea
                                value={details}
                                onChange={(e) => setDetails(e.target.value)}
                                className="w-full min-h-[80px] rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-[13px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#3B82F6]/50 resize-y transition-colors"
                                placeholder={selectedAction === 'other' ? 'Describe how you want the document restructured...' : 'Additional details or instructions (optional)...'}
                                disabled={isProcessing}
                            />
                        </motion.div>

                        {/* Error display */}
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[12px]"
                            >
                                <WarningCircle size={14} weight="fill" className="inline mr-1.5" />
                                {error}
                            </motion.div>
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div className="p-5 px-6 border-t border-white/5 bg-black/20 rounded-b-[20px] flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isProcessing}
                            className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white/50 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleContinue}
                            disabled={isProcessing || (selectedAction === 'other' && !details.trim())}
                            className="btn-primary flex items-center gap-2 !text-[13px] !py-2.5 disabled:opacity-50"
                        >
                            {isProcessing ? (
                                <>
                                    <CircleNotch size={14} className="animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    Continue
                                    <ArrowRight size={14} weight="bold" />
                                </>
                            )}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}

function OptionCard({ title, description, selected, onClick, disabled }: {
    title: string;
    description?: string;
    selected: boolean;
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
            aria-pressed={selected}
            className={`w-full flex items-start gap-3 p-4 rounded-xl border transition-all duration-200 text-left ${
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            } ${
                selected
                    ? 'border-[#3B82F6]/50 bg-[#3B82F6]/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
        >
            <div aria-hidden="true" className={`w-4 h-4 mt-0.5 rounded-full flex shrink-0 items-center justify-center ${
                selected ? 'border-[4px] border-[#3B82F6] bg-white' : 'border-[1.5px] border-white/30'
            }`} />
            <div>
                <span className={`text-[14px] font-semibold block ${selected ? 'text-white' : 'text-white/70'}`}>
                    {title}
                </span>
                {description && (
                    <span className="text-[11px] text-white/40 block mt-0.5">{description}</span>
                )}
            </div>
        </button>
    );
}
