'use client';

import { motion } from 'framer-motion';
import { Lightning, User, Copy, Check } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';

interface MessageBubbleProps {
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
}

/** Ethereal Chat message bubble rendering user or assistant messages with copy-to-clipboard support. */
export default function MessageBubble({ role, content, isStreaming }: MessageBubbleProps) {
    const [copied, setCopied] = useState(false);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        };
    }, []);

    const handleCopy = async () => {
        if (!window.isSecureContext || !navigator.clipboard?.writeText) {
            console.error('Clipboard API unavailable (requires secure context)');
            return;
        }

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
    };

    // Simple markdown-like rendering with XSS protection
    const renderContent = (text: string) => {
        // Escape HTML first to prevent XSS
        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        // Apply markdown-like transforms on safe escaped content
        const transformed = escaped
            .replace(/\*\*(.*?)\*\*/g, '<strong style="color:inherit; font-weight:700">$1</strong>')
            .replace(/\*(.*?)\*/g, '<em style="font-style:italic">$1</em>')
            .replace(/🔴/g, '<span style="color:var(--rose)">🔴</span>')
            .replace(/\n/g, '<br/>');
        return DOMPurify.sanitize(transformed);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className={`flex gap-3 w-full ${role === 'user' ? 'justify-end pl-12' : 'justify-start pr-12'}`}
        >
            {role === 'assistant' && (
                <div
                    className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center mt-1 bg-white shadow-sm border border-[rgba(10,22,41,0.04)]"
                >
                    <Lightning size={18} weight="duotone" className="text-champagne" />
                </div>
            )}

            <div
                className={`max-w-[100%] rounded-[1.5rem] px-6 py-4 shadow-sm border ${
                    role === 'user' ? 'rounded-br-sm' : 'rounded-tl-sm'
                }`}
                style={
                    role === 'user'
                        ? {
                            background: 'var(--sapphire)',
                            borderColor: 'transparent',
                            color: 'white',
                        }
                        : {
                            background: 'rgba(255, 255, 255, 0.7)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            borderColor: 'rgba(255, 255, 255, 0.8)',
                            color: 'var(--sapphire)',
                        }
                }
            >
                <div
                    className={`text-[15px] leading-relaxed whitespace-pre-wrap font-medium ${role === 'user' ? 'text-white' : 'text-sapphire'}`}
                    dangerouslySetInnerHTML={{ __html: renderContent(content) }}
                />

                {role === 'assistant' && !isStreaming && (
                    <div
                        className="flex justify-end gap-2 mt-3 pt-2"
                        style={{ borderTop: '1px solid rgba(10, 22, 41, 0.04)' }}
                    >
                        <button
                            className="bg-cloud hover:bg-[rgba(10,22,41,0.06)] text-sapphire-muted hover:text-sapphire transition-colors text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5 py-1.5 px-3 rounded-lg"
                            onClick={handleCopy}
                            aria-label={copied ? 'Copied to clipboard' : 'Copy message to clipboard'}
                        >
                            {copied ? (
                                <>
                                    <Check size={14} weight="bold" /> Copied
                                </>
                            ) : (
                                <>
                                    <Copy size={14} weight="duotone" /> Copy
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {role === 'user' && (
                <div
                    className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center mt-1 bg-white shadow-sm border border-[rgba(10,22,41,0.04)]"
                >
                    <User size={16} weight="duotone" className="text-sapphire" />
                </div>
            )}
        </motion.div>
    );
}
