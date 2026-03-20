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
            className="flex items-end gap-3 rounded-2xl p-3"
            style={{
                background: 'var(--zinc-50)',
                border: '1px solid var(--zinc-200)',
            }}
        >
            <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder ?? 'Ask NEXX anything...'}
                rows={1}
                className="flex-1 bg-transparent border-none outline-none resize-none text-sm"
                style={{
                    color: 'var(--zinc-900)',
                    caretColor: 'var(--emerald-600)',
                    minHeight: 24,
                    maxHeight: 120,
                    fontFamily: "'Outfit', system-ui, sans-serif",
                }}
            />
            <div className="flex items-center gap-2 flex-shrink-0">
                <button
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 cursor-pointer"
                    style={{
                        background: 'rgba(161, 161, 170, 0.08)',
                        border: '1px solid var(--zinc-200)',
                        color: 'var(--zinc-400)',
                    }}
                    title="Voice input (coming soon)"
                >
                    <Microphone size={16} />
                </button>
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || disabled}
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{
                        background: input.trim()
                            ? 'var(--emerald-600)'
                            : 'rgba(161, 161, 170, 0.08)',
                        color: input.trim() ? '#ffffff' : 'var(--zinc-400)',
                        border: input.trim() ? 'none' : '1px solid var(--zinc-200)',
                        boxShadow: input.trim() ? '0 4px 12px rgba(5, 150, 105, 0.2)' : 'none',
                    }}
                >
                    <PaperPlaneRight size={16} weight={input.trim() ? 'fill' : 'regular'} />
                </button>
            </div>
        </div>
    );
}
