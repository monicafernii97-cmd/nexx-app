'use client';

/**
 * Inline Override Editor — Edit review item text directly within the canvas.
 *
 * Auto-sizes textarea, shows character count, and provides
 * Save/Cancel actions.
 */

import { useState, useRef, useEffect } from 'react';
import { Check, X } from '@phosphor-icons/react';

interface InlineOverrideEditorProps {
    nodeId: string;
    currentText: string;
    onSave: (text: string) => void;
    onCancel: () => void;
}

export default function InlineOverrideEditor({
    nodeId: _nodeId,
    currentText,
    onSave,
    onCancel,
}: InlineOverrideEditorProps) {
    const [text, setText] = useState(currentText);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-focus on mount
    useEffect(() => {
        textareaRef.current?.focus();
        // Move cursor to end
        if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.value.length;
        }
    }, []);

    // Auto-resize textarea
    useEffect(() => {
        const ta = textareaRef.current;
        if (ta) {
            ta.style.height = 'auto';
            ta.style.height = `${ta.scrollHeight}px`;
        }
    }, [text]);

    const hasChanges = text !== currentText;
    const charCount = text.length;

    return (
        <div className="space-y-2">
            <textarea
                ref={textareaRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        onCancel();
                    }
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        if (hasChanges) onSave(text);
                    }
                }}
                className="w-full min-h-[60px] rounded-lg bg-white/[0.06] border border-[#60A5FA]/30 px-3 py-2 text-[13px] text-white/80 placeholder:text-white/30 focus:outline-none focus:border-[#60A5FA]/60 focus:ring-1 focus:ring-[#60A5FA]/20 resize-none leading-relaxed"
                placeholder="Enter override text..."
            />
            <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/25 font-mono">
                    {charCount} chars · ⌘↵ save · esc cancel
                </span>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={onCancel}
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                        title="Cancel (Esc)"
                    >
                        <X size={13} weight="bold" />
                    </button>
                    <button
                        onClick={() => hasChanges && onSave(text)}
                        disabled={!hasChanges}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                            hasChanges
                                ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                                : 'bg-white/5 text-white/20 cursor-not-allowed'
                        }`}
                        title="Save (⌘↵)"
                    >
                        <Check size={13} weight="bold" />
                    </button>
                </div>
            </div>
        </div>
    );
}
