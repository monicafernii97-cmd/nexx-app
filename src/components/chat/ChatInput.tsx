'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { PaperPlaneRight, Microphone, MicrophoneSlash, Paperclip, X } from '@phosphor-icons/react';

/** Augmented window type for vendor-prefixed SpeechRecognition. */
type SpeechRecognitionCtor = new () => SpeechRecognition;

interface ChatInputProps {
    onSend: (message: string, file?: File) => void;
    disabled?: boolean;
    placeholder?: string;
}

/** Premium Auto-resizing chat input bar with send button and voice input. */
export default function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
    const [input, setInput] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [micError, setMicError] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    // Client-only: avoids hydration mismatch since server has no SpeechRecognition
    const [isSpeechSupported, setIsSpeechSupported] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Single source of truth for the current input value, readable from callbacks
    const inputRef = useRef('');
    // Text that existed before the current dictation session started
    const prefixRef = useRef('');
    // Accumulated dictated text for the current session (rebuilt on each onresult)
    const dictatedRef = useRef('');

    /** Update both React state and the mutable ref in one call. */
    const updateInput = useCallback((value: string) => {
        inputRef.current = value;
        setInput(value);
    }, []);

    const getSpeechRecognition = useCallback((): SpeechRecognitionCtor | null => {
        if (typeof window === 'undefined') return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        return w.SpeechRecognition || w.webkitSpeechRecognition || null;
    }, []);

    // Detect speech support client-side only (after hydration)
    useEffect(() => {
        setIsSpeechSupported(getSpeechRecognition() !== null);
    }, [getSpeechRecognition]);

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
                const instance = recognitionRef.current;
                recognitionRef.current = null;
                instance.abort();
            }
        };
    }, []);

    /** Stop any active recognition session. Null ref BEFORE calling abort
     *  to prevent the async onend/onerror callback from clearing a new session. */
    const stopRecognition = useCallback(() => {
        if (recognitionRef.current) {
            const active = recognitionRef.current;
            recognitionRef.current = null;
            active.abort();
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
        prefixRef.current = '';
        dictatedRef.current = '';
    }, [disabled, onSend, stopRecognition, updateInput]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        // Don't send during IME composition (Japanese/Chinese/Korean input)
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    const toggleListening = useCallback(() => {
        setMicError(null);

        // Stop if currently listening — stop() is graceful and lets pending
        // onresult fire with final transcript before onend clears the ref.
        // (Only abort() is immediate and needs null-before-call.)
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

        // Snapshot whatever the user typed before dictation as the prefix
        prefixRef.current = inputRef.current;
        dictatedRef.current = '';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            // Guard: if a new session started, ignore stale events from this instance
            if (recognitionRef.current !== recognition) return;

            // Rebuild the FULL dictated text from the results array on every event.
            // This avoids duplication: the API re-sends all results each time, so
            // we reconstruct rather than append.
            let fullFinal = '';
            let currentInterim = '';

            for (let i = 0; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    fullFinal += event.results[i][0].transcript;
                } else {
                    currentInterim += event.results[i][0].transcript;
                }
            }

            // dictatedRef = all finalized text so far
            dictatedRef.current = fullFinal;

            // Compose: prefix + separator + finalized dictation + interim preview
            const prefix = prefixRef.current;
            const separator = prefix.length > 0 && !prefix.endsWith(' ') ? ' ' : '';
            const composed = prefix + separator + fullFinal + currentInterim;
            updateInput(composed);
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            // Guard: ignore events from a replaced session
            if (recognitionRef.current !== recognition) return;

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
            // Guard: ignore events from a replaced session
            if (recognitionRef.current !== recognition) return;
            setIsListening(false);
            recognitionRef.current = null;
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

    // ── File attachment handler ──
    const handleFileSelect = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'image/jpeg',
            'image/png',
        ];

        if (!allowedTypes.includes(file.type)) {
            setMicError('Unsupported file type. Upload PDF, DOCX, TXT, JPG, or PNG.');
            return;
        }

        if (file.size > 25 * 1024 * 1024) {
            setMicError('File too large. Maximum size is 25MB.');
            return;
        }

        setSelectedFile(file);
        setMicError(null);

        // Reset the input so the same file can be re-selected
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    const removeFile = useCallback(() => {
        setSelectedFile(null);
    }, []);

    const handleSendWithFile = useCallback(() => {
        const trimmed = input.trim();
        if (!trimmed && !selectedFile) return;
        if (disabled || isUploading) return;

        if (isListening) stopRecognition();
        onSend(trimmed || (selectedFile ? `Analyze this file: ${selectedFile.name}` : ''), selectedFile ?? undefined);
        updateInput('');
        setSelectedFile(null);
    }, [input, selectedFile, disabled, isUploading, isListening, stopRecognition, onSend, updateInput]);

    const baseId = useId();
    const micErrorId = micError ? `${baseId}-mic-error` : undefined;

    return (
        <div className="relative">
            {/* File attachment chip */}
            {selectedFile && (
                <div className="flex items-center gap-2 px-4 py-2 mb-2 bg-blue-50 rounded-xl animate-in fade-in slide-in-from-bottom-2">
                    <Paperclip size={14} className="text-blue-500 flex-shrink-0" />
                    <span className="text-xs font-semibold text-blue-700 truncate max-w-[200px]">
                        {selectedFile.name}
                    </span>
                    <span className="text-[10px] text-blue-400">
                        {(selectedFile.size / 1024).toFixed(0)}KB
                    </span>
                    <button
                        type="button"
                        onClick={removeFile}
                        className="ml-auto w-5 h-5 rounded-full bg-blue-100 hover:bg-blue-200 flex items-center justify-center transition-colors"
                        aria-label="Remove attached file"
                    >
                        <X size={10} weight="bold" className="text-blue-600" />
                    </button>
                </div>
            )}
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                onChange={handleFileChange}
            />
            <div
                className={`flex items-end gap-3 rounded-[1.5rem] p-3 bg-white shadow-[0_4px_24px_rgba(208,227,255,0.4)] border transition-all focus-within:ring-2 focus-within:ring-champagne/30 ${
                    isListening ? 'border-red-300 ring-2 ring-red-200/50' : 'border-white'
                }`}
            >
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => {
                        // If user types while dictation is active, stop the session
                        // to prevent prefixRef from going stale and overwriting edits.
                        if (isListening) stopRecognition();
                        updateInput(e.target.value);
                    }}
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
                    {/* File attachment button */}
                    <button
                        type="button"
                        onClick={handleFileSelect}
                        disabled={disabled || isUploading}
                        className={`w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-200 hover:scale-105 cursor-pointer ${
                            selectedFile
                                ? 'bg-blue-100 text-blue-600'
                                : 'bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0A1128]/50 hover:text-[#0A1128]'
                        }`}
                        title="Attach a file"
                        aria-label="Attach a file"
                    >
                        <Paperclip size={18} weight="duotone" />
                    </button>
                    <button
                        type="button"
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
                        aria-label={
                            isListening
                                ? 'Stop voice input'
                                : isSpeechSupported
                                    ? 'Start voice input'
                                    : 'Voice input not supported in this browser'
                        }
                        aria-describedby={micErrorId}
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
                        type="button"
                        onClick={handleSendWithFile}
                        disabled={(!input.trim() && !selectedFile) || disabled}
                        aria-label="Send message"
                        className={`w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-300 shadow-sm ${
                            (input.trim() || selectedFile) && !disabled
                                ? 'bg-[linear-gradient(135deg,#60A5FA,#2563EB)] text-white hover:scale-105 hover:shadow-lg cursor-pointer'
                                : 'bg-[#F1F5F9] text-[#0A1128]/30 cursor-not-allowed'
                        }`}
                    >
                        <PaperPlaneRight size={18} weight={(input.trim() || selectedFile) && !disabled ? "fill" : "regular"} />
                    </button>
                </div>
            </div>
            {micError && (
                <p
                    id={micErrorId}
                    role="status"
                    aria-live="polite"
                    className="text-[11px] font-medium text-red-500 mt-2 text-center px-4 animate-in fade-in"
                >
                    {micError}
                </p>
            )}
        </div>
    );
}
