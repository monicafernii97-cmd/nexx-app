'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Mic } from 'lucide-react';

interface ChatInputProps {
    onSend: (message: string) => void;
    disabled?: boolean;
    placeholder?: string;
}

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
                background: '#0A1E54',
                border: '1px solid rgba(10, 30, 84, 0.15)',
            }}
        >
            <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder ?? 'Consult NEXX Intelligence...'}
                rows={1}
                className="flex-1 bg-transparent border-none outline-none resize-none text-sm"
                style={{
                    color: '#0A1E54',
                    minHeight: 24,
                    maxHeight: 120,
                    fontFamily: 'Inter, sans-serif',
                }}
            />
            <div className="flex items-center gap-2 flex-shrink-0">
                <button
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 cursor-pointer"
                    style={{
                        background: 'rgba(10, 30, 84, 0.08)',
                        border: '1px solid rgba(10, 30, 84, 0.2)',
                        color: '#A0B1DD',
                    }}
                    title="Voice input (coming soon)"
                >
                    <Mic size={16} />
                </button>
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || disabled}
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{
                        background: input.trim()
                            ? 'linear-gradient(135deg, #0A1E54, #14518E)'
                            : 'rgba(10, 30, 84, 0.08)',
                        color: input.trim() ? '#0A1E54' : '#B39A84',
                    }}
                >
                    <Send size={16} />
                </button>
            </div>
        </div>
    );
}
