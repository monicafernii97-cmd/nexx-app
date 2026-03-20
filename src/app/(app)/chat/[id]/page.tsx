'use client';

import { motion } from 'framer-motion';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { useParams, useRouter } from 'next/navigation';
import { Lightning, ArrowLeft, Archive } from '@phosphor-icons/react';
import MessageBubble from '@/components/chat/MessageBubble';
import ChatInput from '@/components/chat/ChatInput';
import { MODE_LABELS } from '@/lib/constants';

/** Full-screen chat interface for a single NEXX AI conversation. */
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
    const archiveConversation = useMutation(api.conversations.archive);

    const [isStreaming, setIsStreaming] = useState(false);
    const [isPending, setIsPending] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

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

    const handleSend = useCallback(
        async (input: string) => {
            if (isStreaming || isPending || !isThreadReady) return;

            setIsPending(true);

            try {
                await sendMessage({
                    conversationId,
                    role: 'user',
                    content: input,
                });

                setIsStreaming(true);
                setStreamingContent('');

                const history = (messages ?? []).map((m) => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                }));
                history.push({ role: 'user', content: input });

                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messages: history,
                        conversationMode: conversation?.mode ?? 'general',
                        userContext: {
                            userName: userProfile?.name,
                            state: userProfile?.state,
                            county: userProfile?.county,
                            custodyType: userProfile?.custodyType,
                            childrenNames: userProfile?.childrenNames,
                            childrenAges: userProfile?.childrenAges,
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
                        },
                    }),
                });

                if (!response.ok) {
                    const errorText = await response.text().catch(() => '');
                    throw new Error(`Failed to get AI response: ${response.status} ${errorText}`);
                }

                const reader = response.body?.getReader();
                const decoder = new TextDecoder();
                let fullContent = '';

                if (reader) {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const chunk = decoder.decode(value, { stream: true });
                        fullContent += chunk;
                        setStreamingContent(fullContent);
                    }
                    fullContent += decoder.decode();
                    setStreamingContent(fullContent);
                }

                if (fullContent) {
                    await sendMessage({
                        conversationId,
                        role: 'assistant',
                        content: fullContent,
                    });
                }
            } catch (error) {
                console.error('Streaming error:', error);
                await sendMessage({
                    conversationId,
                    role: 'assistant',
                    content:
                        "I apologize, but I'm unable to respond right now. Please try again in a moment. If this issue persists, check that the OpenAI API key is configured correctly.",
                }).catch(() => { });
            } finally {
                setIsStreaming(false);
                setIsPending(false);
                setStreamingContent('');
            }
        },
        [conversationId, messages, conversation?.mode, sendMessage, isStreaming, isPending, isThreadReady, userProfile, nexProfile]
    );

    // Early return AFTER all hooks
    if (!isValidId) return null;

    const handleArchive = async () => {
        const confirmed = window.confirm('Archive this conversation? You can still view it in the Archived section.');
        if (!confirmed) return;
        try {
            await archiveConversation({ id: conversationId });
            router.push('/chat');
        } catch (error) {
            console.error('Failed to archive:', error);
        }
    };

    const modeInfo = MODE_LABELS[conversation?.mode ?? 'general'] ?? MODE_LABELS.general;

    return (
        <div className="flex flex-col h-[calc(100vh-48px)] max-w-4xl">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="flex items-center gap-3 pb-4 mb-4"
                style={{ borderBottom: '1px solid var(--hairline)' }}
            >
                <button
                    onClick={() => router.push('/chat')}
                    className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors hover:bg-white/5"
                    aria-label="Back to conversations"
                >
                    <ArrowLeft size={16} style={{ color: 'var(--zinc-400)' }} />
                </button>
                <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                        background: 'var(--emerald-600)',
                        boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
                    }}
                >
                    <Lightning size={18} weight="fill" style={{ color: '#ffffff' }} />
                </div>
                <div className="flex-1">
                    <h1 className="text-lg font-semibold" style={{ color: 'var(--zinc-100)' }}>
                        {conversation?.title || 'NEXX Intelligence'}
                    </h1>
                    <div className="flex items-center gap-2">
                        <span
                            className="badge text-xs"
                            style={{
                                background: `${modeInfo.color}18`,
                                color: modeInfo.color,
                            }}
                        >
                            {modeInfo.label}
                        </span>
                        <p className="text-xs" style={{ color: 'var(--zinc-500)' }}>
                            Strategic Counsel
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleArchive}
                    className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors hover:bg-white/5"
                    title="Archive conversation"
                    aria-label="Archive conversation"
                >
                    <Archive size={14} style={{ color: 'var(--zinc-400)' }} />
                </button>
            </motion.div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-6 pb-4 pr-2">
                {(!messages || messages.length === 0) && !isStreaming && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 20 }}
                        className="flex flex-col items-center justify-center h-full text-center px-4"
                    >
                        <div
                            className="w-16 h-16 rounded-2xl mb-6 flex items-center justify-center"
                            style={{
                                background: 'rgba(16, 185, 129, 0.08)',
                                border: '1px solid rgba(16, 185, 129, 0.12)',
                            }}
                        >
                            <Lightning size={28} weight="duotone" style={{ color: 'var(--emerald-500)' }} />
                        </div>
                        <h2
                            className="text-headline text-2xl mb-2"
                            style={{ color: 'var(--zinc-100)' }}
                        >
                            How can I help you today?
                        </h2>
                        <p className="text-sm max-w-md" style={{ color: 'var(--zinc-500)' }}>
                            Share what&apos;s on your mind — an incident, a message from your NEX,
                            a legal question, or just how you&apos;re feeling. I&apos;m here.
                        </p>
                    </motion.div>
                )}

                {messages?.map((msg) => (
                    <MessageBubble
                        key={msg._id}
                        role={msg.role}
                        content={msg.content}
                    />
                ))}

                {/* Streaming message */}
                {isStreaming && streamingContent && (
                    <MessageBubble
                        role="assistant"
                        content={streamingContent}
                        isStreaming
                    />
                )}

                {/* Loading indicator */}
                {isStreaming && !streamingContent && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex gap-3"
                    >
                        <div
                            className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
                            style={{
                                background: 'var(--emerald-600)',
                                boxShadow: '0 2px 8px rgba(5, 150, 105, 0.2)',
                            }}
                        >
                            <Lightning size={14} weight="fill" style={{ color: '#ffffff' }} />
                        </div>
                        <div
                            className="rounded-2xl rounded-bl-md px-5 py-4"
                            style={{
                                background: 'rgba(255, 255, 255, 0.02)',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                                border: '1px solid var(--hairline)',
                                boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.05)',
                            }}
                        >
                            <div className="flex gap-1.5">
                                {[0, 1, 2].map((j) => (
                                    <motion.div
                                        key={j}
                                        className="w-1.5 h-1.5 rounded-full"
                                        style={{ background: 'var(--zinc-300)' }}
                                        animate={{ opacity: [0.3, 1, 0.3] }}
                                        transition={{
                                            duration: 1,
                                            repeat: Infinity,
                                            delay: j * 0.15,
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 25 }}
                className="pt-4"
                style={{ borderTop: '1px solid var(--hairline)' }}
            >
                <ChatInput onSend={handleSend} disabled={isStreaming || isPending || !isThreadReady} />
                <p className="text-center text-xs mt-2" style={{ color: 'var(--zinc-500)' }}>
                    NEXX provides legal information and strategic guidance, not legal advice.
                </p>
            </motion.div>
        </div>
    );
}
