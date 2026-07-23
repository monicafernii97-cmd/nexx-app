'use client';

import { motion } from 'framer-motion';
import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useParams, useRouter } from 'next/navigation';
import { Archive, ClockCounterClockwise, Lock, Sun, Moon, WarningCircle, X } from '@phosphor-icons/react';
import MessageBubble, { type ChatTheme } from '@/components/chat/MessageBubble';
import ChatInput, { type ChatInputUploadCallbacks } from '@/components/chat/ChatInput';
import { WorkspaceClient } from '@/components/chat/WorkspaceClient';
import { AnalysisStatusStrip, DEFAULT_ANALYSIS_STEPS, getStepsByElapsed } from '@/components/chat/AnalysisStatusStrip';
import type { ActionType, AnalysisStep } from '@/lib/ui-intelligence/types';
import type { ChatAttachmentRef } from '@/lib/chat/uploadConfig';
import { recoverPendingChatUploadAttaches, type ChatComposerFileState, uploadFileForConversation } from '@/lib/chat/uploadClient';
import { createChatRequestId, readChatAdmissionError } from '@/lib/chat/admission';

/** Premium full-screen chat interface for a single NEXX AI conversation. */
export default function ConversationPage() {
    const params = useParams();
    const router = useRouter();
    const rawId = params.id;
    const isValidId = typeof rawId === 'string';
    const conversationId = isValidId ? (rawId as Id<'conversations'>) : ('' as Id<'conversations'>);

    // All hooks must be called unconditionally — use 'skip' when ID is invalid
    const conversation = useQuery(api.conversations.get, isValidId ? { id: conversationId } : 'skip');
    const convex = useConvex();
    const messages = useQuery(api.messages.list, isValidId ? { conversationId } : 'skip');
    const activeTurns = useQuery(api.chatTurns.activeForConversation, isValidId ? { conversationId } : 'skip');
    const archiveConversation = useMutation(api.conversations.archive);

    const [isStreaming, setIsStreaming] = useState(false);
    const [isPending, setIsPending] = useState(false);
    const [awaitingTurnId, setAwaitingTurnId] = useState<string | null>(null);
    const [chatError, setChatError] = useState<string | null>(null);
    const [analysisSteps, setAnalysisSteps] = useState<AnalysisStep[]>(DEFAULT_ANALYSIS_STEPS);
    const streamStartRef = useRef<number>(0);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const composerRef = useRef<HTMLDivElement>(null);
    const pendingInitialSentRef = useRef(false);
    const retryableRequestRef = useRef<{ signature: string; requestId: string } | null>(null);
    const shouldAutoScrollRef = useRef(true);
    const hasActiveTurn = (activeTurns?.length ?? 0) > 0;
    const isGenerating = isStreaming || awaitingTurnId !== null || hasActiveTurn;
    const hasDraftAssistantMessage = Boolean(messages?.some((message) => message.role === 'assistant' && message.status === 'draft'));

    // ── Theme state (persisted to localStorage) ──
    const [theme, setTheme] = useState<ChatTheme>('dark');
    useEffect(() => {
        const saved = localStorage.getItem('nexx-chat-theme');
        if (saved !== 'light' && saved !== 'dark') return;
        const timeoutId = window.setTimeout(() => setTheme(saved), 0);
        return () => window.clearTimeout(timeoutId);
    }, []);

    /** Toggle between light and dark chat themes, persisting the choice to localStorage. */
    const toggleTheme = useCallback(() => {
        setTheme((prev) => {
            const next = prev === 'dark' ? 'light' : 'dark';
            localStorage.setItem('nexx-chat-theme', next);
            return next;
        });
    }, []);
    const isLight = theme === 'light';

    // Toggle dark class on html element for CSS variable switching
    useEffect(() => {
        const html = document.documentElement;
        if (theme === 'dark') {
            html.classList.add('dark');
        } else {
            html.classList.remove('dark');
        }
    }, [theme]);

    // Analysis step progression during streaming
    useEffect(() => {
        if (!isGenerating) {
            streamStartRef.current = 0;
            return;
        }
        if (streamStartRef.current === 0) {
            streamStartRef.current = activeTurns?.[0]?.createdAt ?? Date.now();
        }
        const interval = setInterval(() => {
            const elapsed = (Date.now() - streamStartRef.current) / 1000;
            setAnalysisSteps(getStepsByElapsed(elapsed));
        }, 500);
        return () => clearInterval(interval);
    }, [isGenerating, activeTurns]);

    const isNearBottom = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return true;
        return container.scrollHeight - container.scrollTop - container.clientHeight < 160;
    }, []);

    const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
        window.requestAnimationFrame(() => {
            const container = scrollContainerRef.current;
            if (!container) {
                messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
                return;
            }
            container.scrollTo({ top: container.scrollHeight, behavior });
        });
    }, []);

    // Auto-scroll to bottom on new messages. Scroll the chat pane itself so
    // bottom padding/spacers are honored instead of aligning only the sentinel.
    useEffect(() => {
        if (shouldAutoScrollRef.current) scrollMessagesToBottom('smooth');
    }, [messages, isGenerating, scrollMessagesToBottom]);

    useLayoutEffect(() => {
        const composer = composerRef.current;
        if (!composer) return;

        const updateComposerHeight = () => {
            const shouldStayPinned = isNearBottom();
            document.documentElement.style.setProperty('--chat-composer-height', `${composer.offsetHeight}px`);
            if (shouldStayPinned) scrollMessagesToBottom('auto');
        };

        updateComposerHeight();
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateComposerHeight);
            return () => window.removeEventListener('resize', updateComposerHeight);
        }

        const observer = new ResizeObserver(updateComposerHeight);
        observer.observe(composer);
        window.addEventListener('resize', updateComposerHeight);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateComposerHeight);
        };
    }, [isNearBottom, scrollMessagesToBottom]);

    // Redirect if ID is invalid (after all hooks)
    useEffect(() => {
        if (!isValidId) {
            router.push('/chat');
        }
    }, [isValidId, router]);

    const isThreadReady = conversation !== undefined && messages !== undefined && activeTurns !== undefined;

    useEffect(() => {
        void recoverPendingChatUploadAttaches(convex);
    }, [convex]);

    // Keep the local accepted state until Convex shows either the active turn
    // or its terminal assistant message. This closes the admission/realtime gap.
    useEffect(() => {
        if (!awaitingTurnId || !activeTurns || !messages) return;
        const activeIsVisible = activeTurns.some((turn) => turn._id.toString() === awaitingTurnId);
        const completedIsVisible = messages.some((message) =>
            message.turnId?.toString() === awaitingTurnId &&
            message.role === 'assistant' &&
            message.status !== 'draft'
        );
        if (activeIsVisible || completedIsVisible) {
            const timeoutId = window.setTimeout(() => setAwaitingTurnId(null), 0);
            return () => window.clearTimeout(timeoutId);
        }
    }, [activeTurns, awaitingTurnId, messages]);

    /**
     * Accept a durable chat turn. Provider generation runs in a Convex worker;
     * this page renders user, draft, final, and degraded messages from Convex.
     */
    const callChatAPI = useCallback(async (
        message: string,
        options?: {
            persistUserMessage?: boolean;
            mode?: 'send' | 'retry' | 'edit';
            retryOfAssistantMessageId?: Id<'messages'>;
            editOfUserMessageId?: Id<'messages'>;
            attachments?: ChatAttachmentRef[];
            clientTurnId?: string;
        }
    ) => {
        setIsStreaming(true);
        setChatError(null);
        setAnalysisSteps(DEFAULT_ANALYSIS_STEPS);
        shouldAutoScrollRef.current = true;
        streamStartRef.current = Date.now();

        const signature = JSON.stringify({
            message,
            mode: options?.mode ?? 'send',
            retryOfAssistantMessageId: options?.retryOfAssistantMessageId,
            editOfUserMessageId: options?.editOfUserMessageId,
            attachments: options?.attachments?.map((attachment) => attachment.uploadedFileId),
        });
        const requestId = options?.clientTurnId ?? (
            retryableRequestRef.current?.signature === signature
                ? retryableRequestRef.current.requestId
                : createChatRequestId(conversationId)
        );
        retryableRequestRef.current = { signature, requestId };

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    requestId,
                    clientTurnId: requestId,
                    persistUserMessage: options?.persistUserMessage ?? true,
                    mode: options?.mode ?? (options?.persistUserMessage === false ? 'retry' : 'send'),
                    retryOfAssistantMessageId: options?.retryOfAssistantMessageId,
                    editOfUserMessageId: options?.editOfUserMessageId,
                    attachments: options?.attachments,
                    conversationId,
                }),
            });

            if (!response.ok) {
                throw new Error(await readChatAdmissionError(response));
            }

            const data = await response.json() as {
                ok?: boolean;
                accepted?: boolean;
                error?: string;
                turn?: { turnId?: string };
            };
            if (!data.ok || !data.accepted) {
                throw new Error(data.error || 'Chat turn was not accepted');
            }
            if (!data.turn?.turnId) throw new Error('Chat turn was accepted without a tracking id.');
            setAwaitingTurnId(String(data.turn.turnId));
            retryableRequestRef.current = null;
        } catch (error) {
            console.error('Chat API error:', error);
            const rawMessage = error instanceof Error ? error.message : '';
            const message = rawMessage === 'Failed to fetch' || rawMessage.toLowerCase().includes('network')
                ? 'The connection was interrupted while sending. Try again—NEXX will safely reuse the same request if it was already accepted.'
                : rawMessage || 'NEXX could not send this message. Please try again.';
            setChatError(message);
            throw error;
        } finally {
            setIsStreaming(false);
        }
    }, [conversationId]);
    /** Send a new user message and stream the AI response. */
    const handleSend = useCallback(
        async (
            input: string,
            fileState?: ChatComposerFileState,
            _mode?: unknown,
            uploadCallbacks?: ChatInputUploadCallbacks,
        ) => {
            if (isGenerating || isPending || !isThreadReady) {
                throw new Error('Chat is still getting ready. Please try again in a moment.');
            }
            setIsPending(true);

            try {
                let attachments: ChatAttachmentRef[] | undefined;
                if (fileState?.attachmentRef) {
                    attachments = [fileState.attachmentRef];
                } else if (fileState?.file) {
                    const upload = await uploadFileForConversation({
                        convex,
                        file: fileState.file,
                        conversationId,
                        intent: fileState.intent,
                        clientUploadKey: fileState.clientUploadKey,
                        existingSession: fileState,
                        onProgress: uploadCallbacks?.onProgress,
                        onStatus: uploadCallbacks?.onStatus,
                        onStorageReady: uploadCallbacks?.onStorageReady,
                    });
                    uploadCallbacks?.onComplete(upload);
                    attachments = [upload.attachmentRef];
                }

                // Server handles user message persistence (Step 13 in route.ts).
                // No client-side sendMessage needed — avoids duplicate writes.
                await callChatAPI(input, { attachments, clientTurnId: fileState?.clientTurnId });
            } catch (error) {
                console.error('Send error:', error);
                throw error;
            } finally {
                setIsPending(false);
            }
        },
        [isGenerating, isPending, isThreadReady, conversationId, convex, callChatAPI]
    );

    useEffect(() => {
        pendingInitialSentRef.current = false;
    }, [conversationId]);

    useEffect(() => {
        if (pendingInitialSentRef.current || !isThreadReady || isGenerating || isPending) return;
        if (typeof window === 'undefined') return;

        const initialMsgKey = `nexx_initial_msg_${String(conversationId)}`;
        const handoffMsgKey = `nexx_handoff_msg_${String(conversationId)}`;
        const pendingMessage = sessionStorage.getItem(initialMsgKey) ?? sessionStorage.getItem(handoffMsgKey);

        if (!pendingMessage) return;

        pendingInitialSentRef.current = true;
        let hasStarted = false;
        const timeoutId = window.setTimeout(() => {
            hasStarted = true;
            setIsPending(true);
            void callChatAPI(pendingMessage)
                .then(() => {
                    sessionStorage.removeItem(initialMsgKey);
                    sessionStorage.removeItem(handoffMsgKey);
                })
                .catch(() => {
                    pendingInitialSentRef.current = false;
                })
                .finally(() => setIsPending(false));
        }, 0);

        return () => {
            window.clearTimeout(timeoutId);
            if (!hasStarted) {
                pendingInitialSentRef.current = false;
            }
        };
    }, [conversationId, isThreadReady, isGenerating, isPending, callChatAPI]);

    /**
     * Retry the last AI response — atomically deletes the assistant message
     * and re-streams a fresh answer from the same conversation state.
     */
    const handleRetry = useCallback(
        async (assistantMessageId: Id<'messages'>) => {
            if (isGenerating || isPending || !messages) return;
            setIsPending(true);

            try {
                const targetIndex = messages.findIndex((message) => message._id === assistantMessageId);
                const lastUserMsg = targetIndex >= 0
                    ? messages.slice(0, targetIndex).reverse().find((message) => message.role === 'user')
                    : undefined;
                if (!lastUserMsg) throw new Error('No user message found for retry');

                await callChatAPI(lastUserMsg.content, {
                    persistUserMessage: false,
                    mode: 'retry',
                    retryOfAssistantMessageId: assistantMessageId,
                });
            } catch (error) {
                console.error('Retry error:', error);
                setChatError(error instanceof Error ? error.message : 'NEXX could not retry this response.');
            } finally {
                setIsPending(false);
            }
        },
        [messages, isGenerating, isPending, callChatAPI]
    );

    /**
     * Edit a user message and regenerate — atomically updates the message content,
     * deletes all subsequent messages, and streams a fresh AI response.
     */
    const handleEdit = useCallback(
        async (messageId: Id<'messages'>, newContent: string) => {
            if (isGenerating || isPending || !messages) return;
            setIsPending(true);

            try {
                await callChatAPI(newContent, {
                    persistUserMessage: false,
                    mode: 'edit',
                    editOfUserMessageId: messageId,
                });
            } catch (error) {
                console.error('Edit error:', error);
                setChatError(error instanceof Error ? error.message : 'NEXX could not edit this message.');
            } finally {
                setIsPending(false);
            }
        },
        [messages, isGenerating, isPending, callChatAPI]
    );

    // Early return AFTER all hooks
    if (!isValidId) return null;

    /** Archive the conversation after user confirmation. */
    const handleArchive = async () => {
        const confirmed = window.confirm('Archive this encrypted conversation? It will remain securely stored but removed from your active log.');
        if (!confirmed) return;
        try {
            await archiveConversation({ id: conversationId });
            router.push('/chat');
        } catch (error) {
            console.error('Failed to archive:', error);
        }
    };

    // Helper: determine if a message is the latest of its role
    const lastAssistantId = messages ? [...messages].reverse().find((m) => m.role === 'assistant' && m.status !== 'draft')?._id : undefined;
    const lastUserId = messages ? [...messages].reverse().find((m) => m.role === 'user')?._id : undefined;


    return (
        <WorkspaceClient>
            {(workspace) => (
        <div className={`flex h-[calc(100dvh-80px)] min-h-0 max-w-5xl flex-col overflow-hidden mx-auto px-2 md:px-4 pt-4 transition-colors duration-300 ${isLight ? 'bg-white' : ''}`}>
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mb-5 flex shrink-0 items-center gap-3 border-b pb-3 transition-colors duration-300 ${isLight
                    ? 'border-gray-200 bg-white'
                    : 'border-white/10'
                    }`}
            >
                <div className="min-w-0 flex-1 pl-1">
                    <h1 className={`truncate font-serif text-xl leading-tight tracking-tight ${isLight ? 'text-gray-900' : 'text-white/95'}`}>
                        {conversation?.title || 'NEXX Executive Intelligence'}
                    </h1>
                    <div className="mt-1 flex items-center gap-3">
                        <div className={`flex items-center gap-1 ${isLight ? 'text-gray-400' : 'text-white/40'}`}>
                            <Lock size={10} weight="fill" />
                            <p className="text-[9px] font-bold tracking-widest uppercase truncate">
                                Encrypted
                            </p>
                        </div>
                    </div>
                </div>

                <button
                    onClick={() => router.push('/chat?history=1')}
                    className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[10px] font-bold uppercase tracking-widest transition-all border ${isLight
                        ? 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        : 'bg-white/5 border-white/5 text-white/60 hover:text-white hover:bg-white/10'
                        }`}
                    aria-label="Open conversation history"
                >
                    <ClockCounterClockwise size={15} weight="regular" />
                    <span className="hidden sm:inline">History</span>
                </button>

                {/* Theme toggle */}
                <button
                    onClick={toggleTheme}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-all border ${isLight
                        ? 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                        : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                        }`}
                    title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
                    aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
                >
                    {isLight ? <Moon size={16} weight="regular" /> : <Sun size={16} weight="regular" />}
                </button>

                <button
                    onClick={handleArchive}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-all border ${isLight
                        ? 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                        : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                        }`}
                    title="Archive Conversation"
                    aria-label="Archive Conversation"
                >
                    <Archive size={16} weight="regular" />
                </button>
            </motion.div>

            {/* Messages Area */}
            <div
                ref={scrollContainerRef}
                onScroll={() => {
                    shouldAutoScrollRef.current = isNearBottom();
                }}
                className={`flex-1 min-h-0 overflow-y-auto overscroll-contain w-full no-scrollbar px-1 lg:px-6 relative scroll-smooth flex flex-col transition-colors duration-300 ${isLight ? 'bg-white' : ''}`}
                style={{
                    scrollPaddingBottom: 'calc(var(--chat-composer-height, 176px) + env(safe-area-inset-bottom) + 40px)',
                }}
            >
                {messages?.length === 0 && !isGenerating && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 }}
                        className={`flex flex-col items-center justify-center m-auto text-center px-6 py-10 max-w-sm w-full rounded-2xl ${isLight
                            ? 'bg-white border border-gray-200 shadow-[0_8px_32px_rgba(0,0,0,0.05)]'
                            : 'hyper-glass shadow-[0_8px_32px_rgba(0,0,0,0.3)]'
                            }`}
                    >
                        <div
                            className="w-12 h-12 rounded-xl mb-5 flex items-center justify-center bg-white/5 border border-white/10"
                        >
                            <span className="text-white/60 font-serif font-bold text-xl pb-1"><i>N</i></span>
                        </div>
                        <h2 className={`text-sm font-bold mb-2 ${isLight ? 'text-gray-900' : 'text-white/90'}`}>
                            Secure Counsel Authorized
                        </h2>
                        <p className={`text-xs font-medium mb-6 leading-relaxed ${isLight ? 'text-gray-500' : 'text-white/40'}`}>
                            Share what&apos;s on your mind — an incident, a message from your NEX,
                            a legal concern, or your emotional state.
                        </p>
                        <div className="flex items-center justify-center text-[10px] font-bold tracking-widest uppercase text-white/40 bg-white/5 border border-white/5 px-4 py-2 rounded-lg">
                            Ready to Analyze
                        </div>
                    </motion.div>
                )}

                {messages?.map((msg) => (
                    <MessageBubble
                        key={msg._id}
                        role={msg.role}
                        content={msg.content}
                        isStreaming={msg.status === 'draft'}
                        theme={theme}
                        metadata={msg.metadata}
                        artifactsJson={msg.artifactsJson}
                        onRetry={
                            msg.role === 'assistant' && msg.status !== 'draft' && !isGenerating && !isPending
                                ? () => {
                                    // Confirm if retrying an older message (will delete later turns)
                                    if (msg._id !== lastAssistantId) {
                                        const ok = window.confirm('Retrying this response will delete all messages after it. Continue?');
                                        if (!ok) return;
                                    }
                                    handleRetry(msg._id as Id<'messages'>);
                                }
                                : undefined
                        }
                        onEdit={
                            msg.role === 'user' && !isGenerating && !isPending
                                ? (newContent) => {
                                    // Confirm if editing an older message (will delete later turns)
                                    if (msg._id !== lastUserId) {
                                        const ok = window.confirm('Editing this message will delete all messages after it and regenerate. Continue?');
                                        if (!ok) return;
                                    }
                                    handleEdit(msg._id as Id<'messages'>, newContent);
                                }
                                : undefined
                        }
                        onAction={
                            msg.role === 'assistant'
                                ? (action: ActionType, content?: string) => workspace.onAction(action, {
                                    type: 'overview',
                                    title: 'Assistant response',
                                    content: content ?? msg.content,
                                })
                                : undefined
                        }
                        onSuggestedPrompt={
                            msg.role === 'assistant' && !isGenerating && !isPending
                                ? (prompt) => {
                                    void handleSend(prompt).catch((error) => {
                                        console.error('Suggested prompt failed:', error);
                                    });
                                }
                                : undefined
                        }
                    />
                ))}

                {/* Pre-draft analysis status. Once Convex writes a safe draft, MessageBubble owns the status card. */}
                {isGenerating && !hasDraftAssistantMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex w-full justify-start px-4 sm:px-6 py-4"
                    >
                        <div className="flex gap-4 items-start">
                            <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center shadow-sm border ${isLight
                                ? 'bg-gradient-to-br from-blue-500 to-indigo-600 border-indigo-400/20'
                                : 'bg-gradient-to-br from-blue-600 to-indigo-700 border-indigo-500/20'
                                }`}>
                                <span className="text-white font-serif font-bold text-[14px] animate-pulse"><i>N</i></span>
                            </div>
                            <div className="max-w-[min(92vw,48rem)]">
                                <AnalysisStatusStrip steps={analysisSteps} visible />
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Bottom spacer keeps the final answer clear of the composer/footer on mobile and desktop. */}
                <div
                    ref={messagesEndRef}
                    aria-hidden="true"
                    className="shrink-0"
                    style={{ minHeight: 'calc(var(--chat-composer-height, 176px) + env(safe-area-inset-bottom) + 40px)' }}
                />
            </div>

            {/* Input Area */}
            <motion.div
                ref={composerRef}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="pt-2 pb-6 px-1 lg:px-6 shrink-0 relative z-20"
            >
                {chatError && (
                    <div
                        role="alert"
                        className={`mb-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${isLight
                            ? 'border-red-200 bg-red-50 text-red-800'
                            : 'border-red-400/25 bg-red-500/10 text-red-100'
                        }`}
                    >
                        <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" />
                        <span className="flex-1 leading-relaxed">{chatError}</span>
                        <button
                            type="button"
                            onClick={() => setChatError(null)}
                            className="rounded p-0.5 opacity-70 transition hover:opacity-100"
                            aria-label="Dismiss chat error"
                        >
                            <X size={14} weight="bold" />
                        </button>
                    </div>
                )}
                <div className={`rounded-2xl p-1.5 transition-colors duration-300 ${isLight
                    ? 'bg-white border border-gray-200 shadow-[0_8px_32px_rgba(0,0,0,0.05)]'
                    : 'hyper-glass shadow-[0_8px_32px_rgba(0,0,0,0.4)]'
                    }`}>
                    <ChatInput
                        onSend={handleSend}
                        disabled={isGenerating || isPending || !isThreadReady}
                    />
                </div>
                <p className={`text-center text-[9px] font-bold tracking-widest uppercase mt-3 flex items-center justify-center ${isLight ? 'text-gray-400' : 'text-white/30'}`}>
                    NEXX provides strategic guidance, not formal legal advice.
                </p>
            </motion.div>
        </div>
            )}
        </WorkspaceClient>
    );
}
