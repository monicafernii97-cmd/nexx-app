'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { PaperPlaneRight, Microphone, MicrophoneSlash } from '@phosphor-icons/react';

/** Augmented window type for vendor-prefixed SpeechRecognition. */
type SpeechRecognitionCtor = new () => SpeechRecognition;

interface ChatInputProps {
    onSend: (message: string) => void;
    disabled?: boolean;
    placeholder?: string;
}

/** Premium Auto-resizing chat input bar with send button and voice input. */
export default function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
    const [input, setInput] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [micError, setMicError] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    // Tracks the current input value for the speech recognition callback,
    // avoiding stale closures from useCallback memoization.
    const inputRef = useRef('');

    // Keep inputRef in sync with every input change
    const updateInput = useCallback((value: string) => {
        inputRef.current = value;
        setInput(value);
    }, []);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = '24px';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [input]);

    // Cleanup recognition on unmount
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
                recognitionRef.current = null;
            }
        };
    }, []);

    /** Stop any active recognition session and reset the ref. */
    const stopRecognition = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.abort();
            recognitionRef.current = null;
        }
        setIsListening(false);
    }, []);

    const handleSend = useCallback(() => {
        const text = inputRef.current.trim();
        if (!text || disabled) return;
        // Stop mic before sending to prevent onresult from repopulating the field
        stopRecognition();
        onSend(text);
        updateInput('');
    }, [disabled, onSend, stopRecognition, updateInput]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    const getSpeechRecognition = useCallback((): SpeechRecognitionCtor | null => {
        if (typeof window === 'undefined') return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        return w.SpeechRecognition || w.webkitSpeechRecognition || null;
    }, []);

    const toggleListening = useCallback(() => {
        setMicError(null);

        // Stop if currently listening
        if (isListening && recognitionRef.current) {
            recognitionRef.current.stop();
            setIsListening(false);
            return;
        }

        const SpeechRecognitionCtor = getSpeechRecognition();
        if (!SpeechRecognitionCtor) {
            setMicError('Voice input is not supported in this browser. Please use Chrome or Edge.');
            return;
        }

        const recognition = new SpeechRecognitionCtor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognitionRef.current = recognition;

        // Snapshot the current input as the base for dictation appending.
        // inputRef is always current, so no stale closure issue.
        const baseText = inputRef.current;

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            // Read the latest accumulated base from the ref
            const base = inputRef.current;
            // Only add a separator if speaking over existing text without a trailing space
            const needsSep = base.length > 0
                && !base.endsWith(' ')
                && event.resultIndex === 0;
            const separator = needsSep ? ' ' : '';

            if (finalTranscript) {
                // Final result: append to real accumulated text
                const newText = (event.resultIndex === 0 ? baseText : base) + separator + finalTranscript;
                updateInput(newText);
            } else {
                // Interim result: show preview but don't commit to inputRef
                // (updateInput writes to inputRef, so we use setInput directly for previews)
                const preview = (event.resultIndex === 0 ? baseText : base) + separator + interimTranscript;
                setInput(preview);
            }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            console.error('Speech recognition error:', event.error);
            setIsListening(false);
            recognitionRef.current = null;

            if (event.error === 'not-allowed') {
                setMicError('Microphone access denied. Please allow microphone permissions in your browser settings.');
            } else if (event.error === 'no-speech') {
                // Silently stop — user may have just paused
            } else {
                setMicError(`Voice input error: ${event.error}`);
            }
        };

        recognition.onend = () => {
            setIsListening(false);
            recognitionRef.current = null;
            // Sync inputRef with whatever is currently displayed
            // (interim text may not have been committed)
        };

        try {
            recognition.start();
            setIsListening(true);
        } catch (err) {
            console.error('Failed to start speech recognition:', err);
            setMicError('Failed to start voice input. Please try again.');
            recognitionRef.current = null;
        }
    }, [isListening, getSpeechRecognition, updateInput]);

    const isSpeechSupported = getSpeechRecognition() !== null;

    return (
        <div className="relative">
            <div
                className={`flex items-end gap-3 rounded-[1.5rem] p-3 bg-white shadow-[0_4px_24px_rgba(208,227,255,0.4)] border transition-all focus-within:ring-2 focus-within:ring-champagne/30 ${
                    isListening ? 'border-red-300 ring-2 ring-red-200/50' : 'border-white'
                }`}
            >
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => updateInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isListening ? 'Listening...' : (placeholder ?? 'Consult NEXX Intelligence...')}
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
                        onClick={toggleListening}
                        className={`w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 hover:scale-105 cursor-pointer relative ${
                            isListening
                                ? 'bg-red-500 text-white shadow-md'
                                : isSpeechSupported
                                    ? 'bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0A1128]/50 hover:text-[#0A1128]'
                                    : 'bg-[#F1F5F9] text-[#0A1128]/20'
                        }`}
                        title={
                            isListening
                                ? 'Stop listening'
                                : isSpeechSupported
                                    ? 'Start voice input'
                                    : 'Voice input not supported in this browser'
                        }
                        aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                    >
                        {isListening && (
                            <span className="absolute inset-0 rounded-[14px] bg-red-400 animate-ping opacity-30" />
                        )}
                        {isListening ? (
                            <MicrophoneSlash size={18} weight="fill" className="relative z-10" />
                        ) : (
                            <Microphone size={18} weight="duotone" />
                        )}
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
            {micError && (
                <p className="text-[11px] font-medium text-red-500 mt-2 text-center px-4 animate-in fade-in">{micError}</p>
            )}
        </div>
    );
}
