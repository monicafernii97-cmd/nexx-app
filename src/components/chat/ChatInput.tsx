'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { PaperPlaneRight, Microphone, MicrophoneSlash, Paperclip, X, MagnifyingGlass, PencilLine, ListChecks, Scales, MapPin, Files, Crosshair, FileText, FileArrowUp } from '@phosphor-icons/react';

/** Augmented window type for vendor-prefixed SpeechRecognition. */
type SpeechRecognitionCtor = new () => SpeechRecognition;

/** Structured mode selectors — persistent toggles distinct from quick action chips */
export type ComposerMode = 'general' | 'strategy' | 'judge_lens' | 'drafting' | 'timeline' | 'procedure';

interface ChatInputProps {
    onSend: (message: string, file?: File, mode?: ComposerMode) => void;
    disabled?: boolean;
    placeholder?: string;
    onQuickAction?: (action: string) => void;
    activeMode?: ComposerMode;
    onModeChange?: (mode: ComposerMode) => void;
}

// ---------------------------------------------------------------------------
// Quick Action Chips
// ---------------------------------------------------------------------------

const QUICK_ACTIONS = [
    { id: 'analyze_thread', label: 'Analyze a Thread', icon: MagnifyingGlass },
    { id: 'draft_court', label: 'Draft Court Language', icon: PencilLine },
    { id: 'build_timeline', label: 'Build Timeline', icon: ListChecks },
    { id: 'judge_lens', label: 'Judge Lens', icon: Scales },
    { id: 'local_procedure', label: 'Local Procedure', icon: MapPin },
    { id: 'summarize_evidence', label: 'Summarize Evidence', icon: Files },
    { id: 'find_weak_points', label: 'Find Weak Points', icon: Crosshair },
] as const;

// ---------------------------------------------------------------------------
// Mode Toggles
// ---------------------------------------------------------------------------

const MODE_OPTIONS: { id: ComposerMode; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'strategy', label: 'Strategy' },
    { id: 'judge_lens', label: 'Judge Lens' },
    { id: 'drafting', label: 'Drafting' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'procedure', label: 'Procedure' },
];

/** Premium Auto-resizing chat input bar with quick actions, mode toggles, and voice input. */
export default function ChatInput({ onSend, disabled, placeholder, onQuickAction, activeMode, onModeChange }: ChatInputProps) {
    const [input, setInput] = useState('');
    const [currentMode, setCurrentMode] = useState<ComposerMode>(activeMode ?? 'general');
    const [isListening, setIsListening] = useState(false);
    const [micError, setMicError] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
        if (!text && !selectedFile) return;
        if (disabled) return;
        // Stop mic before sending to prevent onresult from repopulating the field
        stopRecognition();
        onSend(text || (selectedFile ? `Analyze this file: ${selectedFile.name}` : ''), selectedFile ?? undefined);
        updateInput('');
        setSelectedFile(null);
        prefixRef.current = '';
        dictatedRef.current = '';
    }, [disabled, selectedFile, onSend, stopRecognition, updateInput]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        // Don't send during IME composition (Japanese/Chinese/Korean input)
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    const toggleListening = useCallback(() => {
        if (disabled) return;
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
    }, [disabled, isListening, getSpeechRecognition, updateInput]);

    // ── File attachment handler ──
    const handleFileSelect = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const resetInput = () => {
            if (fileInputRef.current) fileInputRef.current.value = '';
        };

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
            resetInput();
            return;
        }

        if (file.size > 25 * 1024 * 1024) {
            setMicError('File too large. Maximum size is 25MB.');
            resetInput();
            return;
        }

        setSelectedFile(file);
        setMicError(null);
        resetInput();
    }, []);

    const removeFile = useCallback(() => {
        setSelectedFile(null);
    }, []);


    const baseId = useId();
    const micErrorId = micError ? `${baseId}-mic-error` : undefined;

    const handleModeChange = useCallback((mode: ComposerMode) => {
        setCurrentMode(mode);
        onModeChange?.(mode);
    }, [onModeChange]);

    const handleQuickActionClick = useCallback((actionId: string) => {
        if (onQuickAction) {
            onQuickAction(actionId);
        } else {
            // Autofill placeholder text if no handler
            const prefills: Record<string, string> = {
                analyze_thread: 'Analyze this thread: ',
                draft_court: 'Draft court-ready language for: ',
                build_timeline: 'Build a timeline from: ',
                judge_lens: 'How would a judge view: ',
                local_procedure: 'What is the procedure for: ',
                summarize_evidence: 'Summarize the evidence for: ',
                find_weak_points: 'Find weak points in: ',
            };
            updateInput(prefills[actionId] ?? '');
            textareaRef.current?.focus();
        }
    }, [onQuickAction, updateInput]);

    return (
        <div className="relative space-y-2">
            {/* Quick Action Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                {QUICK_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                        <button
                            key={action.id}
                            type="button"
                            onClick={() => handleQuickActionClick(action.id)}
                            disabled={disabled}
                            className="
                                inline-flex items-center gap-1.5 px-3 py-1.5
                                text-xs font-medium rounded-full whitespace-nowrap
                                bg-[var(--surface-elevated)] text-[var(--text-muted)]
                                border border-[var(--border-subtle)]
                                hover:text-[var(--accent-icy)] hover:border-[var(--accent-icy)]/30
                                transition-all duration-150
                                disabled:opacity-40 disabled:cursor-not-allowed
                            "
                        >
                            <Icon size={12} />
                            {action.label}
                        </button>
                    );
                })}

                {/* Separator */}
                <span className="w-px h-5 bg-[var(--border-subtle)] flex-shrink-0 mx-1" />

                {/* Upload Thread / Upload Order distinct chips */}
                <button
                    type="button"
                    onClick={() => {
                        if (fileInputRef.current) {
                            fileInputRef.current.accept = '.pdf,.doc,.docx,.txt,.jpg,.jpeg,.png';
                            fileInputRef.current.click();
                        }
                    }}
                    disabled={disabled}
                    className="
                        inline-flex items-center gap-1.5 px-3 py-1.5
                        text-xs font-medium rounded-full whitespace-nowrap
                        bg-[var(--surface-elevated)] text-[var(--text-muted)]
                        border border-[var(--border-subtle)]
                        hover:text-[var(--accent-icy)] hover:border-[var(--accent-icy)]/30
                        transition-all duration-150
                        disabled:opacity-40 disabled:cursor-not-allowed
                    "
                >
                    <FileText size={12} />
                    Upload Thread
                </button>
                <button
                    type="button"
                    onClick={() => {
                        if (fileInputRef.current) {
                            fileInputRef.current.accept = '.pdf,.doc,.docx,.txt';
                            fileInputRef.current.click();
                        }
                    }}
                    disabled={disabled}
                    className="
                        inline-flex items-center gap-1.5 px-3 py-1.5
                        text-xs font-medium rounded-full whitespace-nowrap
                        bg-[var(--surface-elevated)] text-[var(--text-muted)]
                        border border-[var(--border-subtle)]
                        hover:text-[var(--accent-icy)] hover:border-[var(--accent-icy)]/30
                        transition-all duration-150
                        disabled:opacity-40 disabled:cursor-not-allowed
                    "
                >
                    <FileArrowUp size={12} />
                    Upload Order
                </button>
            </div>

            {/* Mode Toggles */}
            <div className="flex items-center gap-1">
                {MODE_OPTIONS.map((mode) => (
                    <button
                        key={mode.id}
                        type="button"
                        onClick={() => handleModeChange(mode.id)}
                        disabled={disabled}
                        className={`
                            px-2.5 py-1 text-[11px] font-semibold rounded-lg
                            transition-all duration-150
                            ${currentMode === mode.id
                                ? 'bg-[var(--accent-icy)]/15 text-[var(--accent-icy)] border border-[var(--accent-icy)]/30'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-body)] hover:bg-[var(--surface-elevated)]'
                            }
                            disabled:opacity-40 disabled:cursor-not-allowed
                        `}
                    >
                        {mode.label}
                    </button>
                ))}
            </div>
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
                    placeholder={isListening ? 'Listening...' : (placeholder ?? 'Ask for strategy, drafting, procedure, timeline help, or judge-oriented framing...')}
                    rows={1}
                    className="flex-1 bg-transparent border-none outline-none resize-none text-sm font-medium placeholder:text-[var(--text-muted)]/60 text-[var(--text-heading)] pl-2 pt-1.5 pb-1"
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
                        disabled={disabled}
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
                        disabled={disabled}
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
                        onClick={handleSend}
                        disabled={(!input.trim() && !selectedFile) || disabled}
                        aria-label="Send message"
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm ${
                            (input.trim() || selectedFile) && !disabled
                                ? 'bg-[var(--accent-icy)] text-white hover:scale-105 hover:shadow-lg cursor-pointer'
                                : 'bg-[var(--surface-elevated)] text-[var(--text-muted)]/30 cursor-not-allowed'
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
