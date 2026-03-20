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

/** Chat message bubble rendering user or assistant messages with copy-to-clipboard support. */
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
        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const transformed = escaped
            .replace(/\*\*(.*?)\*\*/g, '<strong style="color:inherit; font-weight:600">$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br/>');
        return DOMPurify.sanitize(transformed);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className={`flex gap-3 ${role === 'user' ? 'justify-end' : ''}`}
        >
            {role === 'assistant' && (
                <div
                    className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center mt-1"
                    style={{
                        background: 'var(--emerald-600)',
                        boxShadow: '0 2px 8px rgba(5, 150, 105, 0.2)',
                    }}
                >
                    <Lightning size={14} weight="fill" style={{ color: '#ffffff' }} />
                </div>
            )}

            <div
                className={`max-w-[80%] rounded-2xl px-5 py-4 ${role === 'user' ? 'rounded-br-md' : 'rounded-bl-md'
                    }`}
                style={
                    role === 'user'
                        ? {
                            background: 'rgba(255, 255, 255, 0.08)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: 'var(--zinc-100)',
                        }
                        : {
                            background: 'rgba(255, 255, 255, 0.02)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            border: '1px solid var(--hairline)',
                            color: 'var(--zinc-300)',
                            boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.05)',
                        }
                }
            >
                <div
                    className="text-sm leading-relaxed whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: renderContent(content) }}
                />

                {role === 'assistant' && !isStreaming && (
                    <div
                        className="flex gap-2 mt-3 pt-2"
                        style={{ borderTop: '1px solid var(--zinc-200)' }}
                    >
                        <button
                            className="btn-ghost text-xs flex items-center gap-1 py-1 px-2"
                            onClick={handleCopy}
                            aria-label={copied ? 'Copied to clipboard' : 'Copy message to clipboard'}
                            style={{ color: 'var(--zinc-400)' }}
                        >
                            {copied ? (
                                <>
                                    <Check size={12} weight="bold" /> Copied
                                </>
                            ) : (
                                <>
                                    <Copy size={12} /> Copy
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {role === 'user' && (
                <div
                    className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center mt-1"
                    style={{
                        background: 'rgba(63, 63, 70, 0.3)',
                        border: '1px solid rgba(63, 63, 70, 0.5)',
                    }}
                >
                    <User size={14} style={{ color: 'var(--zinc-300)' }} />
                </div>
            )}
        </motion.div>
    );
}
