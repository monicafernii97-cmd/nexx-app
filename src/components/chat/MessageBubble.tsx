'use client';

import { motion } from 'framer-motion';
import { User, Copy, Check, Sparkle } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageBubbleProps {
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
}

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

    if (role === 'user') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="flex gap-3 w-full justify-end px-4 py-6"
            >
                <div className="max-w-[80%] rounded-3xl px-5 py-3 shadow-sm bg-white/10 backdrop-blur-sm border border-white/15 text-white font-medium text-[15px] leading-relaxed whitespace-pre-wrap">
                    {content}
                </div>
            </motion.div>
        );
    }

    // Assistant Message (Full width, markdown)
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="flex gap-4 w-full justify-start px-4 sm:px-6 py-6 group"
        >
            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-1 bg-gradient-to-br from-blue-600 to-indigo-700 shadow-sm border border-indigo-500/20">
                <Sparkle size={16} weight="fill" className="text-white" />
            </div>

            <div className="flex-1 max-w-4xl min-w-0 pr-4">
                <div className="text-[15px] leading-7 text-white/90 font-normal prose prose-invert max-w-none w-full break-words">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {content + (isStreaming ? ' ▍' : '')}
                    </ReactMarkdown>
                </div>

                {!isStreaming && (
                    <div className="flex justify-start gap-2 mt-2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            className="text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors flex items-center gap-1.5 p-1.5 rounded-md"
                            onClick={handleCopy}
                            aria-label={copied ? 'Copied to clipboard' : 'Copy message to clipboard'}
                        >
                            {copied ? (
                                <Check size={16} weight="bold" className="text-emerald-400" />
                            ) : (
                                <Copy size={16} weight="regular" />
                            )}
                        </button>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
