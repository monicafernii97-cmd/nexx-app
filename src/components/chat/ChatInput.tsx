'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import {
    PaperPlaneRight,
    Microphone,
    MicrophoneSlash,
    Paperclip,
    X,
    MagnifyingGlass,
    PencilLine,
    ListChecks,
    Scales,
    MapPin,
    Files,
    Crosshair,
    FileText,
    FileArrowUp,
} from '@phosphor-icons/react';
import type { ChatComposerFileState, ChatUploadResponse } from '@/lib/chat/uploadClient';
import { getChatUploadAccept, validateChatUploadFile, type ChatUploadIntent, type ChatComposerFileStatus } from '@/lib/chat/uploadConfig';

type SpeechRecognitionCtor = new () => SpeechRecognition;
type FilePromptIntent = 'attachment' | 'thread' | 'court_order';

export type ComposerMode = 'general' | 'strategy' | 'judge_lens' | 'drafting' | 'timeline' | 'procedure';

export type ChatInputUploadCallbacks = {
    onProgress: (progress: number) => void;
    onStatus: (status: ChatComposerFileStatus) => void;
    onStorageReady: (ids: { uploadSessionId: string; storageId: string }) => void;
    onComplete: (upload: ChatUploadResponse) => void;
};

interface ChatInputProps {
    onSend: (
        message: string,
        fileState?: ChatComposerFileState,
        mode?: ComposerMode,
        uploadCallbacks?: ChatInputUploadCallbacks,
    ) => void | Promise<void>;
    disabled?: boolean;
    placeholder?: string;
    onQuickAction?: (action: string) => void;
}

const QUICK_ACTIONS = [
    { id: 'analyze_court_order', label: 'Analyze Court Order', icon: FileArrowUp },
    { id: 'analyze_thread', label: 'Analyze a Thread', icon: MagnifyingGlass },
    { id: 'draft_court', label: 'Draft Court Language', icon: PencilLine },
    { id: 'build_timeline', label: 'Build Timeline', icon: ListChecks },
    { id: 'judge_lens', label: 'Judge Lens', icon: Scales },
    { id: 'local_procedure', label: 'Local Procedure', icon: MapPin },
    { id: 'summarize_evidence', label: 'Summarize Evidence', icon: Files },
    { id: 'find_weak_points', label: 'Find Weak Points', icon: Crosshair },
] as const;

export function buildFileFallbackMessage(intent: FilePromptIntent, filename?: string) {
    if (intent === 'court_order') {
        return 'Analyze this court order and extract the key obligations, deadlines, risks, and recommended next steps.';
    }
    if (intent === 'thread') {
        return `Analyze this uploaded thread: ${filename ?? 'uploaded thread'}`;
    }
    return `Analyze this file: ${filename ?? 'uploaded file'}`;
}

function toUploadIntent(intent: FilePromptIntent): ChatUploadIntent {
    return intent === 'court_order' ? 'court_order' : 'attachment';
}

function isBusyStatus(status: ChatComposerFileStatus) {
    return status === 'session_created' || status === 'uploading_to_storage' || status === 'stored' || status === 'processing_queued' || status === 'processing';
}

function isNonRetryableFailure(status: ChatComposerFileStatus) {
    return status === 'failed_empty_extraction';
}

function fileStatusLabel(state: ChatComposerFileState) {
    if (state.status === 'uploading_to_storage') return `${state.progress ?? 0}%`;
    if (state.status === 'processing_queued' || state.status === 'processing') return 'Processing';
    if (state.status === 'ready') return 'Ready';
    if (state.status === 'partial') return 'Text ready';
    if (state.status.startsWith('failed')) return 'Retry';
    if (state.status === 'stalled') return 'Retry';
    return `${((state.file?.size ?? 0) / 1024).toFixed(0)}KB`;
}

export default function ChatInput({ onSend, disabled, placeholder, onQuickAction }: ChatInputProps) {
    const [input, setInput] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [micError, setMicError] = useState<string | null>(null);
    const [selectedFileState, setSelectedFileState] = useState<ChatComposerFileState | null>(null);
    const [selectedFileIntent, setSelectedFileIntent] = useState<FilePromptIntent>('attachment');
    const [isSpeechSupported, setIsSpeechSupported] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const autoSendFileIntentRef = useRef<'court_order' | null>(null);
    const sendInFlightRef = useRef(false);
    const inputRef = useRef('');
    const prefixRef = useRef('');
    const dictatedRef = useRef('');

    const selectedFile = selectedFileState?.file ?? null;
    const isFileBusy = selectedFileState ? isBusyStatus(selectedFileState.status) : false;

    const updateInput = useCallback((value: string) => {
        inputRef.current = value;
        setInput(value);
    }, []);

    const updateSelectedFileState = useCallback((patch: Partial<ChatComposerFileState>) => {
        setSelectedFileState((current) => current ? { ...current, ...patch } : current);
    }, []);

    const createFileState = useCallback((file: File, promptIntent: FilePromptIntent): ChatComposerFileState => ({
        file,
        intent: toUploadIntent(promptIntent),
        clientUploadKey: crypto.randomUUID(),
        status: 'selected',
        progress: 0,
        retryable: true,
    }), []);

    const makeUploadCallbacks = useCallback((): ChatInputUploadCallbacks => ({
        onProgress: (progress) => updateSelectedFileState({ progress }),
        onStatus: (status) => updateSelectedFileState({ status }),
        onStorageReady: ({ uploadSessionId, storageId }) => updateSelectedFileState({
            uploadSessionId,
            storageId,
        }),
        onComplete: (upload) => updateSelectedFileState({
            status: upload.status,
            progress: 100,
            uploadSessionId: upload.uploadSessionId,
            storageId: upload.storageId,
            uploadedFileId: upload.uploadedFileId,
            attachmentRef: upload.attachmentRef,
            retryable: false,
            error: undefined,
        }),
    }), [updateSelectedFileState]);

    const getSpeechRecognition = useCallback((): SpeechRecognitionCtor | null => {
        if (typeof window === 'undefined') return null;
        const w = window as typeof window & {
            SpeechRecognition?: SpeechRecognitionCtor;
            webkitSpeechRecognition?: SpeechRecognitionCtor;
        };
        return w.SpeechRecognition || w.webkitSpeechRecognition || null;
    }, []);

    useEffect(() => {
        setIsSpeechSupported(getSpeechRecognition() !== null);
    }, [getSpeechRecognition]);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = '24px';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [input]);

    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                const instance = recognitionRef.current;
                recognitionRef.current = null;
                instance.abort();
            }
        };
    }, []);

    const stopRecognition = useCallback(() => {
        if (recognitionRef.current) {
            const active = recognitionRef.current;
            recognitionRef.current = null;
            active.abort();
        }
        setIsListening(false);
    }, []);

    const getSendErrorMessage = useCallback((error: unknown) => (
        error instanceof Error ? error.message : 'Upload or send failed. Please try again.'
    ), []);

    const focusComposer = useCallback(() => {
        window.requestAnimationFrame(() => textareaRef.current?.focus());
    }, []);

    const handleSend = useCallback(async () => {
        const text = inputRef.current.trim();
        if (!text && !selectedFileState) return;
        if (disabled || isFileBusy) return;
        if (sendInFlightRef.current) return;
        sendInFlightRef.current = true;
        stopRecognition();

        const fallbackMessage = buildFileFallbackMessage(selectedFileIntent, selectedFileState?.file?.name);
        try {
            await onSend(
                text || (selectedFileState ? fallbackMessage : ''),
                selectedFileState ?? undefined,
                undefined,
                makeUploadCallbacks(),
            );
            updateInput('');
            setSelectedFileState(null);
            setSelectedFileIntent('attachment');
            prefixRef.current = '';
            dictatedRef.current = '';
            setMicError(null);
        } catch (error) {
            const message = getSendErrorMessage(error);
            setMicError(message);
            if (selectedFileState) {
                setSelectedFileState((current) => current ? {
                    ...current,
                    status: isNonRetryableFailure(current.status)
                        ? current.status
                        : current.attachmentRef
                            ? current.status
                            : current.storageId
                                ? 'failed_processing'
                                : 'failed_storage_upload',
                    error: message,
                    retryable: isNonRetryableFailure(current.status) ? current.retryable : true,
                } : current);
                focusComposer();
            }
        } finally {
            sendInFlightRef.current = false;
        }
    }, [
        disabled,
        isFileBusy,
        selectedFileState,
        selectedFileIntent,
        onSend,
        makeUploadCallbacks,
        stopRecognition,
        updateInput,
        getSendErrorMessage,
        updateSelectedFileState,
        focusComposer,
    ]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    const toggleListening = useCallback(() => {
        if (disabled) return;
        setMicError(null);

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
        prefixRef.current = inputRef.current;
        dictatedRef.current = '';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            if (recognitionRef.current !== recognition) return;
            let fullFinal = '';
            let currentInterim = '';

            for (let i = 0; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    fullFinal += event.results[i][0].transcript;
                } else {
                    currentInterim += event.results[i][0].transcript;
                }
            }

            dictatedRef.current = fullFinal;
            const prefix = prefixRef.current;
            const separator = prefix.length > 0 && !prefix.endsWith(' ') ? ' ' : '';
            updateInput(prefix + separator + fullFinal + currentInterim);
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            if (recognitionRef.current !== recognition) return;
            setIsListening(false);
            recognitionRef.current = null;
            if (event.error === 'not-allowed') {
                setMicError('Microphone access denied. Please allow microphone permissions in your browser settings.');
            } else if (event.error !== 'no-speech') {
                setMicError(`Voice input error: ${event.error}`);
            }
        };

        recognition.onend = () => {
            if (recognitionRef.current !== recognition) return;
            setIsListening(false);
            recognitionRef.current = null;
        };

        try {
            recognition.start();
            setIsListening(true);
        } catch {
            setMicError('Failed to start voice input. Please try again.');
            recognitionRef.current = null;
        }
    }, [disabled, isListening, getSpeechRecognition, updateInput]);

    const handleFileSelect = useCallback(() => {
        autoSendFileIntentRef.current = null;
        setSelectedFileIntent('attachment');
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const autoSendIntent = autoSendFileIntentRef.current;
        autoSendFileIntentRef.current = null;

        const resetInput = () => {
            if (fileInputRef.current) fileInputRef.current.value = '';
        };

        const validationError = validateChatUploadFile(file);
        if (validationError) {
            setMicError(validationError);
            resetInput();
            return;
        }

        const nextFileState = createFileState(file, autoSendIntent ?? selectedFileIntent);

        if (autoSendIntent && !disabled) {
            if (sendInFlightRef.current) {
                resetInput();
                return;
            }
            sendInFlightRef.current = true;
            stopRecognition();
            setSelectedFileState(nextFileState);
            try {
                await onSend(
                    buildFileFallbackMessage(autoSendIntent, file.name),
                    nextFileState,
                    undefined,
                    makeUploadCallbacks(),
                );
                updateInput('');
                setSelectedFileState(null);
                setSelectedFileIntent('attachment');
                setMicError(null);
            } catch (error) {
                const message = getSendErrorMessage(error);
                setSelectedFileState((current) => current ? {
                    ...current,
                    status: isNonRetryableFailure(current.status)
                        ? current.status
                        : current.attachmentRef
                            ? current.status
                            : current.storageId
                                ? 'failed_processing'
                                : 'failed_storage_upload',
                    error: message,
                    retryable: isNonRetryableFailure(current.status) ? current.retryable : true,
                } : {
                    ...nextFileState,
                    status: 'failed_storage_upload',
                    error: message,
                    retryable: true,
                });
                setSelectedFileIntent(autoSendIntent);
                setMicError(message);
                focusComposer();
            } finally {
                sendInFlightRef.current = false;
                resetInput();
            }
            return;
        }

        setSelectedFileState(nextFileState);
        setMicError(null);
        resetInput();
        focusComposer();
    }, [
        disabled,
        selectedFileIntent,
        createFileState,
        onSend,
        makeUploadCallbacks,
        stopRecognition,
        updateInput,
        getSendErrorMessage,
        focusComposer,
    ]);

    const removeFile = useCallback(() => {
        setSelectedFileState(null);
        setSelectedFileIntent('attachment');
    }, []);

    const baseId = useId();
    const micErrorId = micError ? `${baseId}-mic-error` : undefined;

    const handleQuickActionClick = useCallback((actionId: string) => {
        if (actionId === 'analyze_court_order') {
            setSelectedFileIntent('court_order');
            autoSendFileIntentRef.current = 'court_order';
            if (fileInputRef.current) {
                fileInputRef.current.accept = getChatUploadAccept();
                fileInputRef.current.click();
            }
            return;
        }

        if (onQuickAction) {
            onQuickAction(actionId);
        } else {
            const prefills: Record<string, string> = {
                analyze_court_order: 'Analyze this court order: ',
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

    const chipButtonClasses = `
        inline-flex items-center gap-1.5 px-3 py-1.5
        text-xs font-medium rounded-full whitespace-nowrap
        bg-[var(--surface-elevated)] text-[var(--text-muted)]
        border border-[var(--border-subtle)]
        hover:text-[var(--accent-icy)] hover:border-[var(--accent-icy)]/30
        transition-all duration-150
        disabled:opacity-40 disabled:cursor-not-allowed
    `;

    return (
        <div className="relative space-y-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                {QUICK_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                        <button
                            key={action.id}
                            type="button"
                            onClick={() => handleQuickActionClick(action.id)}
                            disabled={disabled || isFileBusy}
                            className={chipButtonClasses}
                        >
                            <Icon size={12} />
                            {action.label}
                        </button>
                    );
                })}

                <span className="w-px h-5 bg-[var(--border-subtle)] flex-shrink-0 mx-1" />

                <button
                    type="button"
                    onClick={() => {
                        autoSendFileIntentRef.current = null;
                        setSelectedFileIntent('thread');
                        if (fileInputRef.current) {
                            fileInputRef.current.accept = getChatUploadAccept();
                            fileInputRef.current.click();
                        }
                    }}
                    disabled={disabled || isFileBusy}
                    className={chipButtonClasses}
                >
                    <FileText size={12} />
                    Upload Thread
                </button>
                <button
                    type="button"
                    onClick={() => {
                        autoSendFileIntentRef.current = null;
                        setSelectedFileIntent('court_order');
                        if (fileInputRef.current) {
                            fileInputRef.current.accept = getChatUploadAccept();
                            fileInputRef.current.click();
                        }
                    }}
                    disabled={disabled || isFileBusy}
                    className={chipButtonClasses}
                >
                    <FileArrowUp size={12} />
                    Upload Order
                </button>
            </div>

            {selectedFileState?.file && (
                <div className="flex items-center gap-2 px-4 py-2 mb-2 bg-blue-50 rounded-xl animate-in fade-in slide-in-from-bottom-2">
                    <Paperclip size={14} className="text-blue-500 flex-shrink-0" />
                    <span className="text-xs font-semibold text-blue-700 truncate max-w-[200px]">
                        {selectedFileState.file.name}
                    </span>
                    <span className="text-[10px] text-blue-400">
                        {fileStatusLabel(selectedFileState)}
                    </span>
                    <button
                        type="button"
                        onClick={removeFile}
                        disabled={isFileBusy || disabled}
                        className="ml-auto w-5 h-5 rounded-full bg-blue-100 hover:bg-blue-200 flex items-center justify-center transition-colors disabled:opacity-40"
                        aria-label="Remove attached file"
                    >
                        <X size={10} weight="bold" className="text-blue-600" />
                    </button>
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={getChatUploadAccept()}
                onChange={handleFileChange}
            />

            <div
                className={`flex items-end gap-3 rounded-xl p-2 transition-all focus-within:ring-1 focus-within:ring-indigo-500/30 ${
                    isListening ? 'bg-red-500/10 border-red-500/50' : 'bg-transparent border-transparent'
                }`}
            >
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => {
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
                    <button
                        type="button"
                        onClick={handleFileSelect}
                        disabled={disabled || isFileBusy}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 cursor-pointer ${
                            selectedFile
                                ? 'bg-indigo-500/10 text-indigo-400'
                                : 'bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-body)]'
                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                        title="Attach a file"
                        aria-label="Attach a file"
                    >
                        <Paperclip size={16} weight="regular" />
                    </button>
                    <button
                        type="button"
                        onClick={toggleListening}
                        disabled={disabled || isFileBusy}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 cursor-pointer relative ${
                            isListening
                                ? 'bg-red-500 text-white shadow-md'
                                : isSpeechSupported
                                    ? 'bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-body)]'
                                    : 'bg-[var(--surface-elevated)] opacity-50 cursor-not-allowed text-[var(--text-muted)]'
                        }`}
                        title={isListening ? 'Stop listening' : isSpeechSupported ? 'Start voice input' : 'Voice input not supported in this browser'}
                        aria-label={isListening ? 'Stop voice input' : isSpeechSupported ? 'Start voice input' : 'Voice input not supported in this browser'}
                        aria-describedby={micErrorId}
                    >
                        {isListening && (
                            <span className="absolute inset-0 rounded-lg bg-red-400 animate-ping opacity-30" />
                        )}
                        {isListening ? (
                            <MicrophoneSlash size={16} weight="fill" className="relative z-10" />
                        ) : (
                            <Microphone size={16} weight="regular" />
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={handleSend}
                        disabled={(!input.trim() && !selectedFile) || disabled || isFileBusy}
                        aria-label="Send message"
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm ${
                            (input.trim() || selectedFile) && !disabled && !isFileBusy
                                ? 'bg-[var(--accent-icy)] text-white hover:scale-105 hover:shadow-lg cursor-pointer'
                                : 'bg-[var(--surface-elevated)] text-[var(--text-muted)]/30 cursor-not-allowed'
                        }`}
                    >
                        <PaperPlaneRight size={18} weight={(input.trim() || selectedFile) && !disabled && !isFileBusy ? 'fill' : 'regular'} />
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
