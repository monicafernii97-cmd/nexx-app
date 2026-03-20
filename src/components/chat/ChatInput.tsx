'use client';

import { useState, useRef, useEffect } from 'react';
import { PaperPlaneRight, Microphone } from '@phosphor-icons/react';

interface ChatInputProps {
    onSend: (message: string) => void;
    disabled?: boolean;
    placeholder?: string;
}

/** Premium Auto-resizing chat input bar with send button and voice input placeholder. */
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
            className="flex items-end gap-3 rounded-[1.5rem] p-3 bg-white/80 backdrop-blur-md shadow-[0_4px_24px_rgba(208,227,255,0.4)] border border-white transition-all focus-within:ring-2 focus-within:ring-champagne/30"
        >
            <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder ?? 'Consult NEXX Intelligence...'}
                rows={1}
                className="flex-1 bg-transparent border-none outline-none resize-none text-[15px] font-bold placeholder:text-[#0A1128]/40 text-[#0A1128] pl-2 pt-2 pb-1"
                style={{
                    caretColor: '#2563EB',
                    minHeight: 24,
                    maxHeight: 120,
                }}
            />
            <div className="flex items-center gap-2 flex-shrink-0">
                <button
                    className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 hover:scale-105 cursor-pointer bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0A1128]/50 hover:text-[#0A1128]"
                    title="Voice input (coming soon)"
                >
                    <Microphone size={18} weight="duotone" />
                </button>
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || disabled}
                    className={`w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-300 shadow-sm ${
                        input.trim() && !disabled
                            ? 'bg-[linear-gradient(135deg,#60A5FA,#2563EB)] text-white hover:scale-105 hover:shadow-lg cursor-pointer'
                            : 'bg-[#F1F5F9] text-[#0A1128]/30 cursor-not-allowed'
                    }`}
                >
                    <PaperPlaneRight size={18} weight={input.trim() && !disabled ? "fill" : "regular"} />
                </button>
            </div>
        </div>
    );
}
