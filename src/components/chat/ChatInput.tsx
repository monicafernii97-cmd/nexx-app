'use client';

import { useState, useRef, useEffect } from 'react';
import { PaperPlaneRight, Microphone } from '@phosphor-icons/react';

interface ChatInputProps {
    onSend: (message: string) => void;
    disabled?: boolean;
    placeholder?: string;
}

/** Auto-resizing chat input bar with send button and voice input placeholder. */
export default function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = '24px';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [input]);

    const handleSend = () => {
        if (!input.trim() || disabled) return;
        onSend(input.trim());
        setInput('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div
            className="flex items-end gap-3 rounded-3xl p-3 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] transition-all duration-300"
            style={{
                background: 'rgba(255, 255, 255, 0.03)',
                backdropFilter: 'blur(32px)',
                WebkitBackdropFilter: 'blur(32px)',
                border: '1px solid var(--hairline)',
                boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.05)',
            }}
        >
            <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder ?? 'Ask NEXX anything...'}
                rows={1}
                className="flex-1 bg-transparent border-none outline-none resize-none text-sm placeholder:text-zinc-600 px-2 font-light"
                style={{
                    color: 'var(--zinc-100)',
                    caretColor: 'var(--emerald-500)',
                    minHeight: 24,
                    maxHeight: 120,
                    fontFamily: "'Outfit', system-ui, sans-serif",
                }}
            />
            <div className="flex items-center gap-2 flex-shrink-0">
                <button
                    className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-300 hover:scale-105 cursor-pointer"
                    style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--hairline)',
                        color: 'var(--zinc-400)',
                    }}
                    title="Voice input (coming soon)"
                >
                    <Microphone size={18} weight="light" />
                </button>
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || disabled}
                    className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-300 hover:scale-[1.02] active:scale-95 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed group"
                    style={{
                        background: input.trim()
                            ? 'var(--emerald-600)'
                            : 'rgba(255, 255, 255, 0.03)',
                        color: input.trim() ? '#ffffff' : 'var(--zinc-500)',
                        border: input.trim() ? 'none' : '1px solid var(--hairline)',
                        boxShadow: input.trim() ? '0 8px 16px rgba(16, 185, 129, 0.25), inset 0 1px 1px rgba(255,255,255,0.2)' : 'none',
                    }}
                >
                    <PaperPlaneRight size={16} weight={input.trim() ? 'fill' : 'regular'} />
                </button>
            </div>
        </div>
    );
}
