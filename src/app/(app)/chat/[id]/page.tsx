'use client';

import { motion } from 'framer-motion';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useParams, useRouter } from 'next/navigation';
import { Archive, ClockCounterClockwise, Lock, Sun, Moon } from '@phosphor-icons/react';
import MessageBubble, { type ChatTheme } from '@/components/chat/MessageBubble';
import ChatInput, { type ChatInputUploadCallbacks } from '@/components/chat/ChatInput';
import { WorkspaceClient } from '@/components/chat/WorkspaceClient';
import { AnalysisStatusStrip, DEFAULT_ANALYSIS_STEPS, getStepsByElapsed } from '@/components/chat/AnalysisStatusStrip';
import type { ActionType, AnalysisStep } from '@/lib/ui-intelligence/types';
import type { ChatAttachmentRef } from '@/lib/chat/uploadConfig';
import { type ChatComposerFileState, uploadFileForConversation } from '@/lib/chat/uploadClient';

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
    const userProfile = useQuery(api.users.me);
    const nexProfile = useQuery(api.nexProfiles.getByUser);
    const prepareRegenerate = useMutation(api.messages.prepareRegenerate);
    const archiveConversation = useMutation(api.conversations.archive);

    const [isStreaming, setIsStreaming] = useState(false);
    const [isPending, setIsPending] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    const [analysisSteps, setAnalysisSteps] = useState<AnalysisStep[]>(DEFAULT_ANALYSIS_STEPS);
    const streamStartRef = useRef<number>(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const pendingInitialSentRef = useRef(false);
    const hasActiveTurn = (activeTurns?.length ?? 0) > 0;
    const isGenerating = isStreaming || hasActiveTurn;

    // ── Theme state (persisted to localStorage) ──
    const [theme, setTheme] = useState<ChatTheme>('dark');
    useEffect(() => {
        const saved = localStorage.getItem('nexx-chat-theme');
        if (saved === 'light' || saved === 'dark') setTheme(saved);
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
            setAnalysisSteps(DEFAULT_ANALYSIS_STEPS);
            return;
        }
        const interval = setInterval(() => {
            const elapsed = (Date.now() - streamStartRef.current) / 1000;
            setAnalysisSteps(getStepsByElapsed(elapsed));
        }, 500);
        return () => clearInterval(interval);
    }, [isGenerating]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingContent]);

    // Redirect if ID is invalid (after all hooks)
    useEffect(() => {
        if (!isValidId) {
            router.push('/chat');
        }
    }, [isValidId, router]);

    const isThreadReady = conversation !== undefined && messages !== undefined && activeTurns !== undefined;

    /** Build the user context payload sent to the chat API (shared between send/retry/edit). */
    const buildUserContext = useCallback(() => ({
        userName: userProfile?.name,
        state: userProfile?.state,
        county: userProfile?.county,
        custodyType: userProfile?.custodyType,
        children: userProfile?.children ?? (userProfile?.childrenNames?.map((n, i) => ({ name: n, age: userProfile?.childrenAges?.[i] ?? 0 }))),
        courtCaseNumber: userProfile?.courtCaseNumber,
        hasAttorney: userProfile?.hasAttorney,
        hasTherapist: userProfile?.hasTherapist,
        tonePreference: userProfile?.tonePreference,
        emotionalState: userProfile?.emotionalState,
        nexBehaviors: nexProfile?.behaviors,
        nexNickname: nexProfile?.nickname,
        nexCommunicationStyle: nexProfile?.communicationStyle,
        nexManipulationTactics: nexProfile?.manipulationTactics,
        nexTriggerPatterns: nexProfile?.triggerPatterns,
        nexAiInsights: nexProfile?.aiInsights,
        nexDangerLevel: nexProfile?.dangerLevel,
        nexDetectedPatterns: nexProfile?.detectedPatterns,
    }), [userProfile, nexProfile]);

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
        }
    ) => {
        setIsStreaming(true);
        setStreamingContent('');
        streamStartRef.current = Date.now();

        const requestId = `${conversationId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
                    userContext: buildUserContext(),
                    conversationId,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(`Failed to accept chat turn: ${response.status} ${errorText}`);
            }

            const data = await response.json();
            if (!data.ok || !data.accepted) {
                throw new Error(data.error || 'Chat turn was not accepted');
            }

            setStreamingContent('');
        } catch (error) {
            console.error('Chat API error:', error);
            setStreamingContent('Message was not sent. Please try again.');
            window.setTimeout(() => setStreamingContent(''), 4000);
            throw error;
        } finally {
            setIsStreaming(false);
        }
    }, [conversationId, buildUserContext]);
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
                    setStreamingContent(`Uploading ${fileState.file.name}...`);
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
                    setStreamingContent('');
                }

                // Server handles user message persistence (Step 13 in route.ts).
                // No client-side sendMessage needed — avoids duplicate writes.
                await callChatAPI(input, { attachments });
            } catch (error) {
                console.error('Send error:', error);
                const message = error instanceof Error ? error.message : 'Upload or send failed. Please try again.';
                setStreamingContent(message);
                window.setTimeout(() => setStreamingContent(''), 5000);
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
                const history = await prepareRegenerate({
                    conversationId,
                    targetMessageId: assistantMessageId,
                });

                // Extract the last user message from history for the server
                const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
                if (!lastUserMsg) throw new Error('No user message found for retry');

                await callChatAPI(lastUserMsg.content, {
                    persistUserMessage: false,
                    mode: 'retry',
                    retryOfAssistantMessageId: assistantMessageId,
                });
            } catch (error) {
                console.error('Retry error:', error);
            } finally {
                setIsPending(false);
            }
        },
        [conversationId, messages, isGenerating, isPending, prepareRegenerate, callChatAPI]
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
                await prepareRegenerate({
                    conversationId,
                    targetMessageId: messageId,
                    newContent,
                });

                // For edits, the new content IS the message text
                await callChatAPI(newContent, {
                    persistUserMessage: false,
                    mode: 'edit',
                    editOfUserMessageId: messageId,
                });
            } catch (error) {
                console.error('Edit error:', error);
            } finally {
                setIsPending(false);
            }
        },
        [conversationId, messages, isGenerating, isPending, prepareRegenerate, callChatAPI]
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
        <div className={`flex flex-col h-[calc(100vh-80px)] max-w-5xl mx-auto px-2 md:px-4 pt-4 transition-colors duration-300 ${isLight ? 'bg-white' : ''}`}>
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

            {/* Analysis Status Strip */}
            <div className="px-4 lg:px-8">
                <AnalysisStatusStrip steps={analysisSteps} visible={isGenerating} />
            </div>

            {/* Messages Area */}
            <div className={`flex-1 overflow-y-auto w-full no-scrollbar pb-6 px-1 lg:px-6 relative scroll-smooth flex flex-col transition-colors duration-300 ${isLight ? 'bg-white' : ''}`}>
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
                    />
                ))}

                {/* Streaming / preserved message */}
                {streamingContent && (
                    <MessageBubble
                        role="assistant"
                        content={streamingContent}
                        isStreaming={isStreaming}
                        theme={theme}
                    />
                )}

                {/* Loading indicator (Pre-stream) — now covered by AnalysisStatusStrip */}
                {isGenerating && !streamingContent && (
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
                            <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl ${isLight ? 'bg-gray-100' : 'bg-white/10'}`}>
                                {[0, 1, 2].map((j) => (
                                    <motion.div
                                        key={j}
                                        className={`w-2 h-2 rounded-full ${isLight ? 'bg-blue-500' : 'bg-white'}`}
                                        animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
                                        transition={{
                                            duration: 0.8,
                                            repeat: Infinity,
                                            delay: j * 0.15,
                                            ease: "easeInOut"
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Invisible element to scroll to bottom */}
                <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Input Area */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="pt-2 pb-6 px-1 lg:px-6 shrink-0 relative z-20"
            >
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
