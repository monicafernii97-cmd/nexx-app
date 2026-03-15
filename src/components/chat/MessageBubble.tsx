'use client';

import { motion } from 'framer-motion';
import { Sparkles, User, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import DOMPurify from 'dompurify';

interface MessageBubbleProps {
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
}

/** Chat message bubble — renders user/assistant messages with markdown formatting and copy action. */
export default function MessageBubble({ role, content, isStreaming }: MessageBubbleProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(content)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch((err) => {
                console.error('Failed to copy:', err);
            });
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
            .replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight:600">$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/🔴/g, '<span>🔴</span>')
            .replace(/\n/g, '<br/>');
        return DOMPurify.sanitize(transformed);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className={`flex gap-3 ${role === 'user' ? 'justify-end' : ''}`}
        >
            {role === 'assistant' && (
                <div
                    className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center mt-1"
                    style={{ background: 'linear-gradient(135deg, #C58B07, #E5B84A)' }}
                >
                    <Sparkles size={14} style={{ color: '#02022d' }} />
                </div>
            )}

            <div
                className={`max-w-[80%] rounded-2xl px-5 py-4 ${role === 'user' ? 'rounded-br-md' : 'rounded-bl-md'
                    }`}
                style={
                    role === 'user'
                        ? {
                            background: 'linear-gradient(135deg, rgba(197, 139, 7, 0.15), rgba(197, 139, 7, 0.08))',
                            border: '1px solid rgba(197, 139, 7, 0.2)',
                            color: '#F5EFE0',
                        }
                        : {
                            background: '#02022d',
                            border: '1px solid rgba(197, 139, 7, 0.1)',
                            color: '#D4C9B0',
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
                        style={{ borderTop: '1px solid rgba(197, 139, 7, 0.08)' }}
                    >
                        <button
                            className="btn-ghost text-xs flex items-center gap-1 py-1 px-2"
                            onClick={handleCopy}
                            aria-label={copied ? 'Copied to clipboard' : 'Copy message to clipboard'}
                        >
                            {copied ? (
                                <>
                                    <Check size={12} /> Copied
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
                        background: 'rgba(197, 139, 7, 0.12)',
                        border: '1px solid rgba(197, 139, 7, 0.2)',
                    }}
                >
                    <User size={14} style={{ color: '#C58B07' }} />
                </div>
            )}
        </motion.div>
    );
}
