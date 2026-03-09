'use client';

import { motion } from 'framer-motion';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { useParams, useRouter } from 'next/navigation';
import { Sparkles, ArrowLeft, Archive as ArchiveIcon } from 'lucide-react';
import MessageBubble from '@/components/chat/MessageBubble';
import ChatInput from '@/components/chat/ChatInput';

const MODE_LABELS: Record<string, { label: string; color: string }> = {
    therapeutic: { label: 'Therapeutic', color: '#5A9E6F' },
    legal: { label: 'Legal', color: '#5A8EC9' },
    strategic: { label: 'Strategic', color: '#E5A84A' },
    general: { label: 'General', color: '#C58B07' },
};

export default function ConversationPage() {
    const params = useParams();
    const router = useRouter();
    const conversationId = params.id as Id<'conversations'>;

    const conversation = useQuery(api.conversations.get, { id: conversationId });
    const messages = useQuery(api.messages.list, { conversationId });
    const sendMessage = useMutation(api.messages.send);
    const archiveConversation = useMutation(api.conversations.archive);

    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingContent]);

    const handleSend = useCallback(
        async (input: string) => {
            if (isStreaming) return;

            // Save user message
            await sendMessage({
                conversationId,
                role: 'user',
                content: input,
            });

            // Stream AI response
            setIsStreaming(true);
            setStreamingContent('');

            try {
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
                    }),
                });

                if (!response.ok) {
                    throw new Error('Failed to get AI response');
                }

                const reader = response.body?.getReader();
                const decoder = new TextDecoder();
                let fullContent = '';

                if (reader) {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const chunk = decoder.decode(value);
                        fullContent += chunk;
                        setStreamingContent(fullContent);
                    }
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
                        "I apologize, but I'm unable to respond right now. Please try again in a moment. If this issue persists, check that the OpenAI API key is configured correctly.",
                });
            } finally {
                setIsStreaming(false);
                setStreamingContent('');
            }
        },
        [conversationId, messages, conversation?.mode, sendMessage, isStreaming]
    );

    const handleArchive = async () => {
        await archiveConversation({ id: conversationId });
        router.push('/chat');
    };

    const modeInfo = MODE_LABELS[conversation?.mode ?? 'general'] ?? MODE_LABELS.general;

    return (
        <div className="flex flex-col h-[calc(100vh-48px)] max-w-4xl mx-auto">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 pb-4 mb-4"
                style={{ borderBottom: '1px solid rgba(197, 139, 7, 0.1)' }}
            >
                <button
                    onClick={() => router.push('/chat')}
                    className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors hover:bg-[rgba(197,139,7,0.08)]"
                >
                    <ArrowLeft size={16} style={{ color: '#C58B07' }} />
                </button>
                <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                        background: 'linear-gradient(135deg, #C58B07, #E5B84A)',
                        boxShadow: '0 2px 12px rgba(197, 139, 7, 0.25)',
                    }}
                >
                    <Sparkles size={18} style={{ color: '#02022d' }} />
                </div>
                <div className="flex-1">
                    <h1 className="text-lg font-semibold" style={{ color: '#F5EFE0' }}>
                        {conversation?.title || 'NEXX Strategic AI'}
                    </h1>
                    <div className="flex items-center gap-2">
                        <span
                            className="badge text-xs"
                            style={{
                                background: `${modeInfo.color}20`,
                                color: modeInfo.color,
                            }}
                        >
                            {modeInfo.label}
                        </span>
                        <p className="text-xs" style={{ color: '#92783A' }}>
                            Executive Intelligence
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleArchive}
                    className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors hover:bg-[rgba(197,139,7,0.08)]"
                    title="Archive conversation"
                >
                    <ArchiveIcon size={14} style={{ color: '#8A7A60' }} />
                </button>
            </motion.div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-6 pb-4 pr-2">
                {(!messages || messages.length === 0) && !isStreaming && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex flex-col items-center justify-center h-full text-center px-4"
                    >
                        <div
                            className="w-20 h-20 rounded-2xl mb-6 flex items-center justify-center"
                            style={{
                                background: 'rgba(197, 139, 7, 0.08)',
                                border: '1px solid rgba(197, 139, 7, 0.15)',
                            }}
                        >
                            <Sparkles size={32} style={{ color: '#C58B07' }} />
                        </div>
                        <h2
                            className="font-serif text-2xl font-semibold mb-2"
                            style={{ color: '#F5EFE0' }}
                        >
                            How can I help you today?
                        </h2>
                        <p className="text-sm max-w-md" style={{ color: '#8A7A60' }}>
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
                            className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center animate-pulse-gold"
                            style={{
                                background: 'linear-gradient(135deg, #C58B07, #E5B84A)',
                            }}
                        >
                            <Sparkles size={14} style={{ color: '#02022d' }} />
                        </div>
                        <div
                            className="rounded-2xl rounded-bl-md px-5 py-4"
                            style={{
                                background: '#02022d',
                                border: '1px solid rgba(197, 139, 7, 0.1)',
                            }}
                        >
                            <div className="flex gap-1.5">
                                {[0, 1, 2].map((j) => (
                                    <motion.div
                                        key={j}
                                        className="w-2 h-2 rounded-full"
                                        style={{ background: '#C58B07' }}
                                        animate={{ opacity: [0.3, 1, 0.3] }}
                                        transition={{
                                            duration: 1,
                                            repeat: Infinity,
                                            delay: j * 0.2,
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
                transition={{ delay: 0.2 }}
                className="pt-4"
                style={{ borderTop: '1px solid rgba(197, 139, 7, 0.1)' }}
            >
                <ChatInput onSend={handleSend} disabled={isStreaming} />
                <p className="text-center text-xs mt-2" style={{ color: '#5A4A30' }}>
                    NEXX provides legal information and strategic guidance, not legal advice.
                </p>
            </motion.div>
        </div>
    );
}
