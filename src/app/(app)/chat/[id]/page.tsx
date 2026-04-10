'use client';

import { motion } from 'framer-motion';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { Id } from '@convex/_generated/dataModel';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Archive, Lock, Sun, Moon } from '@phosphor-icons/react';
import MessageBubble, { type ChatTheme } from '@/components/chat/MessageBubble';
import ChatInput from '@/components/chat/ChatInput';
import type { NexxAssistantResponse, RouteMode } from '@/lib/types';

const VALID_ROUTE_MODES: readonly RouteMode[] = [
    'adaptive_chat', 'direct_legal_answer', 'local_procedure',
    'document_analysis', 'judge_lens_strategy', 'court_ready_drafting',
    'pattern_analysis', 'support_grounding', 'safety_escalation',
] as const;

function isValidRouteMode(value: unknown): value is RouteMode {
    return typeof value === 'string' && VALID_ROUTE_MODES.includes(value as RouteMode);
}

/** Premium full-screen chat interface for a single NEXX AI conversation. */
export default function ConversationPage() {
    const params = useParams();
    const router = useRouter();
    const rawId = params.id;
    const isValidId = typeof rawId === 'string';
    const conversationId = isValidId ? (rawId as Id<'conversations'>) : ('' as Id<'conversations'>);

    // All hooks must be called unconditionally — use 'skip' when ID is invalid
    const conversation = useQuery(api.conversations.get, isValidId ? { id: conversationId } : 'skip');
    const messages = useQuery(api.messages.list, isValidId ? { conversationId } : 'skip');
    const userProfile = useQuery(api.users.me);
    const nexProfile = useQuery(api.nexProfiles.getByUser);
    const sendMessage = useMutation(api.messages.send);
    const prepareRegenerate = useMutation(api.messages.prepareRegenerate);
    const archiveConversation = useMutation(api.conversations.archive);

    const [isStreaming, setIsStreaming] = useState(false);
    const [isPending, setIsPending] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    /** Tracks an assistant reply that was streamed but failed to persist. */
    const [unsavedReply, setUnsavedReply] = useState<string | null>(null);
    /** Tracks artifacts/mode/requestId for an unsaved reply so retry persistence restores the full message. */
    const [unsavedResponseData, setUnsavedResponseData] = useState<{
        requestId: string;
        artifactsJson?: string;
        mode?: RouteMode;
    } | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

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

    const isThreadReady = conversation !== undefined && messages !== undefined;

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
     * Call the NEXX chat API and persist the response.
     * Uses the Responses API (non-streaming structured JSON) — the API
     * returns `{ ok, response: NexxAssistantResponse, routeMode }`.
     * A stable requestId guarantees idempotent persistence.
     */
    const callChatAPI = useCallback(async (history: { role: 'user' | 'assistant'; content: string }[]) => {
        setIsStreaming(true);
        setStreamingContent('');
        setUnsavedReply(null);

        const requestId = `${conversationId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: history,
                    userContext: buildUserContext(),
                    conversationId,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(`Failed to get AI response: ${response.status} ${errorText}`);
            }

            const data = await response.json() as {
                ok: boolean;
                response?: NexxAssistantResponse;
                routeMode?: string;
                error?: string;
            };

            if (!data.ok || !data.response) {
                throw new Error(data.error || 'Unknown error from chat API');
            }

            const fullContent = data.response.message;
            const artifactsJson = JSON.stringify(data.response.artifacts);
            const mode = isValidRouteMode(data.routeMode) ? data.routeMode : undefined;
            setStreamingContent(fullContent);

            // Persist the assistant response with artifacts
            try {
                await sendMessage({
                    conversationId,
                    role: 'assistant',
                    content: fullContent,
                    requestId,
                    artifactsJson,
                    mode,
                });
                setStreamingContent('');
                setUnsavedReply(null);
                setUnsavedResponseData(null);
            } catch (persistError) {
                console.error('Failed to persist AI response:', persistError);
                try {
                    // Retry with same requestId — idempotent, no duplicates
                    await sendMessage({
                        conversationId,
                        role: 'assistant',
                        content: fullContent,
                        requestId,
                        artifactsJson,
                        mode,
                    });
                    setStreamingContent('');
                    setUnsavedReply(null);
                    setUnsavedResponseData(null);
                } catch {
                    // Mark as unsaved — blocks new sends until resolved
                    setUnsavedReply(fullContent);
                    setUnsavedResponseData({ requestId, artifactsJson, mode });
                    console.error('Retry persistence also failed — response preserved in UI for manual copy');
                }
            }
        } catch (error) {
            console.error('Chat API error:', error);
            await sendMessage({
                conversationId,
                role: 'assistant',
                content: "I apologize, but I'm unable to process this right now due to a connection issue. Please try again. Your data remains secure.",
            }).catch(() => {});
            setStreamingContent('');
        } finally {
            setIsStreaming(false);
        }
    }, [conversationId, sendMessage, buildUserContext]);

    /** Send a new user message and stream the AI response. */
    const handleSend = useCallback(
        async (input: string) => {
            // Block sends when there's an unsaved reply (UI/model context would diverge)
            if (isStreaming || isPending || !isThreadReady || unsavedReply) return;
            setIsPending(true);

            try {
                await sendMessage({
                    conversationId,
                    role: 'user',
                    content: input,
                });

                const history = (messages ?? []).map((m) => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                }));
                history.push({ role: 'user', content: input });

                await callChatAPI(history);
            } catch (error) {
                console.error('Send error:', error);
            } finally {
                setIsPending(false);
            }
        },
        [conversationId, messages, sendMessage, isStreaming, isPending, isThreadReady, unsavedReply, callChatAPI]
    );

    /**
     * Retry the last AI response — atomically deletes the assistant message
     * and re-streams a fresh answer from the same conversation state.
     */
    const handleRetry = useCallback(
        async (assistantMessageId: Id<'messages'>) => {
            if (isStreaming || isPending || !messages) return;
            setIsPending(true);

            try {
                const history = await prepareRegenerate({
                    conversationId,
                    targetMessageId: assistantMessageId,
                });

                await callChatAPI(history);
            } catch (error) {
                console.error('Retry error:', error);
            } finally {
                setIsPending(false);
            }
        },
        [conversationId, messages, isStreaming, isPending, prepareRegenerate, callChatAPI]
    );

    /**
     * Edit a user message and regenerate — atomically updates the message content,
     * deletes all subsequent messages, and streams a fresh AI response.
     */
    const handleEdit = useCallback(
        async (messageId: Id<'messages'>, newContent: string) => {
            if (isStreaming || isPending || !messages) return;
            setIsPending(true);

            try {
                const history = await prepareRegenerate({
                    conversationId,
                    targetMessageId: messageId,
                    newContent,
                });

                await callChatAPI(history);
            } catch (error) {
                console.error('Edit error:', error);
            } finally {
                setIsPending(false);
            }
        },
        [conversationId, messages, isStreaming, isPending, prepareRegenerate, callChatAPI]
    );

    /** Dismiss an unsaved reply, clearing it from the UI. */
    const handleDismissUnsaved = useCallback(() => {
        setUnsavedReply(null);
        setUnsavedResponseData(null);
        setStreamingContent('');
    }, []);

    /** Retry persisting the unsaved reply with full artifacts, mode, and requestId. */
    const handleRetryPersist = useCallback(async () => {
        if (!unsavedReply) return;
        try {
            await sendMessage({
                conversationId,
                role: 'assistant',
                content: unsavedReply,
                requestId: unsavedResponseData?.requestId,
                artifactsJson: unsavedResponseData?.artifactsJson,
                mode: unsavedResponseData?.mode,
            });
            setUnsavedReply(null);
            setUnsavedResponseData(null);
            setStreamingContent('');
        } catch {
            console.error('Retry persistence failed again');
        }
    }, [unsavedReply, unsavedResponseData, conversationId, sendMessage]);

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
    const lastAssistantId = messages ? [...messages].reverse().find((m) => m.role === 'assistant')?._id : undefined;
    const lastUserId = messages ? [...messages].reverse().find((m) => m.role === 'user')?._id : undefined;


    return (
        <div className={`flex flex-col h-[calc(100vh-80px)] max-w-5xl mx-auto px-2 md:px-4 pt-4 transition-colors duration-300 ${isLight ? 'bg-white' : ''}`}>
            {/* Header (Glass Morphism Pill) */}
            <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl p-4 flex items-center gap-4 mb-6 shadow-sm shrink-0 transition-colors duration-300 ${isLight
                    ? 'bg-white border border-gray-200 shadow-md'
                    : 'glass-ethereal border-white'
                    }`}
            >
                <button
                    onClick={() => router.push('/chat')}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all hover:scale-105 shadow-sm border ${isLight
                        ? 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        : 'bg-white border-[rgba(10,22,41,0.05)] text-[#1E3A8A] hover:shadow'
                        }`}
                    aria-label="Back to conversations"
                >
                    <ArrowLeft size={18} weight="bold" />
                </button>
                
                <div className="flex-1 min-w-0 pl-1">
                    <h1 className={`text-[17px] font-bold truncate ${isLight ? 'text-gray-900' : 'text-sapphire'}`}>
                        {conversation?.title || 'NEXX Executive Intelligence'}
                    </h1>
                    <div className="flex items-center gap-3 mt-1">
                        <div className={`flex items-center gap-1 ${isLight ? 'text-gray-400' : 'text-[rgba(10,22,41,0.4)]'}`}>
                            <Lock size={12} weight="fill" />
                            <p className="text-[11px] font-bold tracking-widest uppercase truncate">
                                Encrypted
                            </p>
                        </div>
                    </div>
                </div>

                {/* Theme toggle */}
                <button
                    onClick={toggleTheme}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all hover:scale-105 border ${isLight
                        ? 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                        : 'bg-white/10 border-white/15 text-white/70 hover:bg-white/20'
                        }`}
                    title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
                    aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
                >
                    {isLight ? <Moon size={18} weight="duotone" /> : <Sun size={18} weight="duotone" />}
                </button>

                <button
                    onClick={handleArchive}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all border ${isLight
                        ? 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                        : 'bg-white hover:bg-cloud border-transparent hover:border-[rgba(10,22,41,0.05)] text-sapphire-muted hover:text-sapphire'
                        }`}
                    title="Archive Conversation"
                    aria-label="Archive Conversation"
                >
                    <Archive size={18} weight="duotone" />
                </button>
            </motion.div>

            {/* Messages Area */}
            <div className={`flex-1 overflow-y-auto w-full no-scrollbar pb-6 px-1 lg:px-6 relative scroll-smooth flex flex-col transition-colors duration-300 ${isLight ? 'bg-white' : ''}`}>
                {messages?.length === 0 && !isStreaming && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 }}
                        className={`flex flex-col items-center justify-center m-auto text-center px-6 py-12 max-w-md w-full rounded-2xl ${isLight
                            ? 'bg-gray-50 border border-gray-200'
                            : 'card-premium'
                            }`}
                    >
                        <div
                            className="w-20 h-20 rounded-[24px] mb-6 flex items-center justify-center bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] shadow-[0_8px_32px_rgba(18,61,126,0.3)] border border-white/10"
                        >
                            <span className="text-white font-serif font-bold text-[40px] drop-shadow-sm pb-2"><i>N</i></span>
                        </div>
                        <h2 className={`font-serif text-2xl font-bold mb-3 ${isLight ? 'text-gray-900' : 'text-sapphire'}`}>
                            Secure Counsel Authorized
                        </h2>
                        <p className={`text-[15px] max-w-sm font-medium mb-6 leading-relaxed ${isLight ? 'text-gray-500' : 'text-sapphire-muted'}`}>
                            Share what&apos;s on your mind — an incident, a message from your NEX,
                            a legal concern, or your emotional state.
                        </p>
                        <div className="flex items-center justify-center text-[12px] font-bold tracking-[0.2em] uppercase text-white bg-[linear-gradient(135deg,#60A5FA,#2563EB)] px-5 py-2.5 rounded-full shadow-md">
                            Ready to Analyze
                        </div>
                    </motion.div>
                )}

                {messages?.map((msg) => (
                    <MessageBubble
                        key={msg._id}
                        role={msg.role}
                        content={msg.content}
                        theme={theme}
                        artifactsJson={msg.artifactsJson}
                        onRetry={
                            msg.role === 'assistant' && !isStreaming && !isPending && !unsavedReply
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
                            msg.role === 'user' && !isStreaming && !isPending && !unsavedReply
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
                    />
                ))}

                {/* Streaming / preserved message */}
                {streamingContent && (
                    <MessageBubble
                        role="assistant"
                        content={streamingContent}
                        isStreaming={isStreaming}
                        theme={theme}
                        artifactsJson={unsavedResponseData?.artifactsJson}
                    />
                )}

                {/* Unsaved reply action bar */}
                {unsavedReply && !isStreaming && (
                    <div className={`flex items-center gap-2 px-6 py-2 text-xs font-semibold ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>
                        <span>⚠ Response could not be saved.</span>
                        <button
                            onClick={handleRetryPersist}
                            className="underline hover:no-underline"
                        >
                            Retry
                        </button>
                        <button
                            onClick={handleDismissUnsaved}
                            className="underline hover:no-underline"
                        >
                            Dismiss
                        </button>
                    </div>
                )}

                {/* Loading indicator (Pre-stream) */}
                {isStreaming && !streamingContent && (
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

            {/* Input Area (Floating Pill) */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="pt-2 pb-6 px-1 lg:px-6 shrink-0 relative z-20"
            >
                <div className={`rounded-[2rem] p-2 shadow-lg transition-colors duration-300 ${isLight
                    ? 'bg-white border border-gray-200 shadow-md'
                    : 'glass-ethereal border-white'
                    }`}>
                    <ChatInput onSend={handleSend} disabled={isStreaming || isPending || !isThreadReady || !!unsavedReply} />
                </div>
                <p className={`text-center text-[10px] font-bold tracking-[0.15em] uppercase mt-4 flex items-center justify-center ${isLight ? 'text-gray-400' : 'text-[#0A1128]/50'}`}>
                    NEXX provides strategic guidance, not formal legal advice.
                </p>
            </motion.div>
        </div>
    );
}
