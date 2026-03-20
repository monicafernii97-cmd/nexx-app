'use client';

import { motion } from 'framer-motion';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Archive, FlowArrow } from '@phosphor-icons/react';
import MessageBubble from '@/components/chat/MessageBubble';
import ChatInput from '@/components/chat/ChatInput';
import { MODE_LABELS } from '@/lib/constants';

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

            // Set pending immediately to prevent double-submit
            setIsPending(true);

            try {
                // Save user message inside try so failures are caught
                await sendMessage({
                    conversationId,
                    role: 'user',
                    content: input,
                });

                // Stream AI response
                setIsStreaming(true);
                setStreamingContent('');

                // Build message history for the API
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
                    // Flush any remaining bytes from incomplete multi-byte sequences
                    fullContent += decoder.decode();
                    setStreamingContent(fullContent);
                }

                // Save the full AI response to Convex
                if (fullContent) {
                    await sendMessage({
                        conversationId,
                        role: 'assistant',
                        content: fullContent,
                    });
                }
            } catch (error) {
                console.error('Streaming error:', error);
                // Save error message as fallback
                await sendMessage({
                    conversationId,
                    role: 'assistant',
                    content:
                        "I apologize, but I'm unable to process this right now due to a connection issue. Please try again. Your data remains secure.",
                }).catch(() => { }); // Don't throw if fallback also fails
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
        const confirmed = window.confirm('Archive this encrypted conversation? It will remain securely stored but removed from your active log.');
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
        <div className="flex flex-col h-[calc(100vh-80px)] max-w-5xl mx-auto px-2 md:px-4 pt-4">
            {/* Header (Glass Morphism Pill) */}
            <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-ethereal rounded-2xl p-4 flex items-center gap-4 mb-6 shadow-sm border-white shrink-0"
            >
                <button
                    onClick={() => router.push('/chat')}
                    className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all hover:scale-105 bg-white shadow-sm border border-[rgba(10,22,41,0.05)] text-sapphire hover:shadow"
                    aria-label="Back to conversations"
                >
                    <ArrowLeft size={18} weight="bold" />
                </button>
                
                <div
                    className="w-12 h-12 rounded-[14px] flex items-center justify-center bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] shadow-[0_4px_16px_rgba(18,61,126,0.3)] border border-white/10"
                >
                    <span className="text-white font-serif font-bold text-[22px] drop-shadow-sm pb-1"><i>N</i></span>
                </div>
                
                <div className="flex-1 min-w-0">
                    <h1 className="text-[17px] font-bold text-sapphire truncate">
                        {conversation?.title || 'NEXX Executive Intelligence'}
                    </h1>
                    <div className="flex items-center gap-3 mt-1">
                        <span
                            className="badge text-[10px] font-bold tracking-wider py-1 px-2 shadow-sm"
                            style={{
                                background: `color-mix(in srgb, ${modeInfo.color} 15%, white)`,
                                color: modeInfo.color,
                                border: `1px solid color-mix(in srgb, ${modeInfo.color} 30%, transparent)`,
                            }}
                        >
                            {modeInfo.label} MODE
                        </span>
                        <div className="flex items-center gap-1.5 text-sapphire-muted">
                            <FlowArrow size={12} weight="bold" />
                            <p className="text-[12px] font-medium truncate">
                                End-to-End Encrypted
                            </p>
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleArchive}
                    className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all bg-white hover:bg-cloud border border-transparent hover:border-[rgba(10,22,41,0.05)] text-sapphire-muted hover:text-sapphire"
                    title="Archive Conversation"
                    aria-label="Archive Conversation"
                >
                    <Archive size={18} weight="duotone" />
                </button>
            </motion.div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto w-full no-scrollbar pb-6 px-1 lg:px-6 relative scroll-smooth flex flex-col space-y-6">
                {(!messages || messages.length === 0) && !isStreaming && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 }}
                        className="flex flex-col items-center justify-center m-auto text-center px-6 py-12 card-premium max-w-md w-full"
                    >
                        <div
                            className="w-20 h-20 rounded-[24px] mb-6 flex items-center justify-center bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] shadow-[0_8px_32px_rgba(18,61,126,0.3)] border border-white/10"
                        >
                            <span className="text-white font-serif font-bold text-[40px] drop-shadow-sm pb-2"><i>N</i></span>
                        </div>
                        <h2 className="font-serif text-2xl font-bold mb-3 text-sapphire">
                            Secure Counsel Authorized
                        </h2>
                        <p className="text-[15px] max-w-sm text-sapphire-muted font-medium mb-6 leading-relaxed">
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

                {/* Loading indicator (Pre-stream) */}
                {isStreaming && !streamingContent && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex w-full justify-start pl-2"
                    >
                        <div className="flex max-w-[85%] lg:max-w-[75%] gap-4">
                            <div className="w-10 h-10 rounded-[12px] flex-shrink-0 flex items-center justify-center bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] shadow-md sticky top-2 z-10 border border-white/10">
                                <span className="text-white font-serif font-bold text-[18px] drop-shadow-sm mb-0.5 animate-pulse"><i>N</i></span>
                            </div>
                            <div className="card-premium p-5 rounded-tl-sm flex items-center gap-3 w-32 border-white bg-white/60">
                                {[0, 1, 2].map((j) => (
                                    <motion.div
                                        key={j}
                                        className="w-2 h-2 rounded-full bg-sapphire"
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
                <div className="glass-ethereal rounded-[2rem] p-2 shadow-lg border-white">
                    <ChatInput onSend={handleSend} disabled={isStreaming || isPending || !isThreadReady} />
                </div>
                <p className="text-center text-[10px] font-bold tracking-[0.15em] uppercase mt-4 text-[#0A1128]/50 flex items-center justify-center">
                    NEXX provides strategic guidance, not formal legal advice.
                </p>
            </motion.div>
        </div>
    );
}
