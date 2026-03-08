'use client';

import { motion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { useUser } from '@/lib/user-context';
import {
    Send,
    Mic,
    Sparkles,
    User,
    Copy,
    RotateCcw,
} from 'lucide-react';

const MOCK_RESPONSES = [
    `I hear you, and I want you to know — what you're experiencing is not normal co-parenting friction. This is a pattern of **control and manipulation**.

Let me break down what's happening psychologically:

**1. The NEX's Tactic:** They're using the court order as a weapon — not as a framework for cooperation. By constantly threatening contempt, they're keeping you in a state of fear and hypervigilance. This is textbook **coercive control**.

**2. What They Want:** They want you to react emotionally. They want you to over-explain, defend yourself, and lose your composure. Your distress is their validation.

**3. Your Strategic Response:**
- **Do not respond emotionally.** Take 24 hours before replying to any non-emergency message.
- **Keep it brief and factual.** "Acknowledged. [Child's name] will be ready at the agreed time."
- **Document everything.** I've noted this incident. Would you like me to create a court-ready record?

*Remember: Regulated triumphs over dysregulated. Every single time. You've got this.* ✨

⚠️ *This is strategic guidance, not legal advice. For specific legal counsel, please consult a licensed attorney.*`,

    `Let me analyze this situation for you:

**What the NEX is doing:** They're engaging in what's called **"documentation warfare"** — manufacturing perceived violations to build a case against you. The calls to the doctor's office, the demands about homework, the clothing disputes — these aren't genuine concerns about your child. They're **control points**.

**The Pattern I See:**
- 🔴 Micromanagement of your parenting decisions
- 🔴 Creating conflicts over trivial items (water bottles, clothing)
- 🔴 Contacting third parties (doctors, schools) to undermine you
- 🔴 Weaponizing child support obligations while paying late

**Here's Your Power Move:**
1. **Stop engaging on their terms.** You don't owe explanations about homework methods or water bottles.
2. **Gray rock response:** "Thank you for sharing your perspective. I'll continue to ensure [child's name]'s needs are met."
3. **Document the pattern.** Each individual incident seems small. *Together, they reveal systematic harassment.*

Would you like me to draft a court-ready summary of this pattern? Or would you like a script for responding to their latest message?

⚠️ *This is strategic guidance, not legal advice.*`,
];

export default function ChatPage() {
    const { userId } = useUser();
    const [conversationId, setConversationId] = useState<Id<'conversations'> | null>(null);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const createConversation = useMutation(api.conversations.create);
    const sendMessage = useMutation(api.messages.send);
    const messages = useQuery(
        api.messages.list,
        conversationId ? { conversationId } : 'skip'
    );

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading || !userId) return;

        let convId = conversationId;

        // Create conversation if first message
        if (!convId) {
            convId = await createConversation({
                userId,
                title: input.trim().slice(0, 50),
                mode: 'general',
            });
            setConversationId(convId);
        }

        // Save user message to Convex
        await sendMessage({
            conversationId: convId,
            role: 'user',
            content: input.trim(),
        });

        setInput('');
        setIsLoading(true);

        // Mock AI response (will be replaced with real OpenAI later)
        setTimeout(async () => {
            const responseIndex = (messages?.length ?? 0) % MOCK_RESPONSES.length;
            await sendMessage({
                conversationId: convId!,
                role: 'assistant',
                content: MOCK_RESPONSES[responseIndex],
            });
            setIsLoading(false);
        }, 1500);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-48px)] max-w-4xl mx-auto">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 pb-4 mb-4"
                style={{ borderBottom: '1px solid rgba(197, 139, 7, 0.1)' }}
            >
                <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                        background: 'linear-gradient(135deg, #C58B07, #E5B84A)',
                        boxShadow: '0 2px 12px rgba(197, 139, 7, 0.25)',
                    }}
                >
                    <Sparkles size={18} style={{ color: '#02022d' }} />
                </div>
                <div>
                    <h1 className="text-lg font-semibold" style={{ color: '#F5EFE0' }}>
                        NEXX Strategic AI
                    </h1>
                    <p className="text-xs" style={{ color: '#92783A' }}>
                        Executive Intelligence
                    </p>
                </div>
            </motion.div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-6 pb-4 pr-2">
                {(!messages || messages.length === 0) && !isLoading && (
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
                        <h2 className="font-serif text-2xl font-semibold mb-2" style={{ color: '#F5EFE0' }}>
                            How can I help you today?
                        </h2>
                        <p className="text-sm max-w-md" style={{ color: '#8A7A60' }}>
                            Share what&apos;s on your mind — an incident, a message from your NEX, a legal question, or just how you&apos;re feeling. I&apos;m here.
                        </p>
                        <div className="flex flex-wrap gap-2 mt-6 justify-center">
                            {[
                                'Analyze a message from my NEX',
                                'Help me respond to a threat',
                                'Explain my court order rights',
                                'I need to vent',
                            ].map((suggestion) => (
                                <button
                                    key={suggestion}
                                    onClick={() => setInput(suggestion)}
                                    className="btn-outline text-xs py-2 px-4"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}

                {messages?.map((msg) => (
                    <motion.div
                        key={msg._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
                    >
                        {msg.role === 'assistant' && (
                            <div
                                className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center mt-1"
                                style={{ background: 'linear-gradient(135deg, #C58B07, #E5B84A)' }}
                            >
                                <Sparkles size={14} style={{ color: '#02022d' }} />
                            </div>
                        )}

                        <div
                            className={`max-w-[80%] rounded-2xl px-5 py-4 ${msg.role === 'user' ? 'rounded-br-md' : 'rounded-bl-md'
                                }`}
                            style={
                                msg.role === 'user'
                                    ? {
                                        background: 'linear-gradient(135deg, rgba(197, 139, 7, 0.15), rgba(197, 139, 7, 0.08))',
                                        border: '1px solid rgba(197, 139, 7, 0.2)',
                                        color: '#F5EFE0',
                                    }
                                    : {
                                        background: '#02022d',
                                        border: '1px solid rgba(197, 139, 7, 0.1)',
                                        color: '#D4C9B0',
                                    }
                            }
                        >
                            <div
                                className="text-sm leading-relaxed whitespace-pre-wrap"
                                dangerouslySetInnerHTML={{
                                    __html: msg.content
                                        .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#C58B07">$1</strong>')
                                        .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                        .replace(/🔴/g, '<span>🔴</span>')
                                        .replace(/\n/g, '<br/>')
                                }}
                            />
                            {msg.role === 'assistant' && (
                                <div className="flex gap-2 mt-3 pt-2" style={{ borderTop: '1px solid rgba(197, 139, 7, 0.08)' }}>
                                    <button
                                        className="btn-ghost text-xs flex items-center gap-1 py-1 px-2"
                                        onClick={() => navigator.clipboard.writeText(msg.content)}
                                    >
                                        <Copy size={12} /> Copy
                                    </button>
                                </div>
                            )}
                        </div>

                        {msg.role === 'user' && (
                            <div
                                className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center mt-1"
                                style={{
                                    background: 'rgba(197, 139, 7, 0.12)',
                                    border: '1px solid rgba(197, 139, 7, 0.2)',
                                }}
                            >
                                <User size={14} style={{ color: '#C58B07' }} />
                            </div>
                        )}
                    </motion.div>
                ))}

                {isLoading && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                        <div
                            className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center animate-pulse-gold"
                            style={{ background: 'linear-gradient(135deg, #C58B07, #E5B84A)' }}
                        >
                            <Sparkles size={14} style={{ color: '#02022d' }} />
                        </div>
                        <div
                            className="rounded-2xl rounded-bl-md px-5 py-4"
                            style={{ background: '#02022d', border: '1px solid rgba(197, 139, 7, 0.1)' }}
                        >
                            <div className="flex gap-1.5">
                                {[0, 1, 2].map((j) => (
                                    <motion.div
                                        key={j}
                                        className="w-2 h-2 rounded-full"
                                        style={{ background: '#C58B07' }}
                                        animate={{ opacity: [0.3, 1, 0.3] }}
                                        transition={{ duration: 1, repeat: Infinity, delay: j * 0.2 }}
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
                <div
                    className="flex items-end gap-3 rounded-2xl p-3"
                    style={{ background: '#02022d', border: '1px solid rgba(197, 139, 7, 0.15)' }}
                >
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Consult NEXX Intelligence..."
                        rows={1}
                        className="flex-1 bg-transparent border-none outline-none resize-none text-sm"
                        style={{
                            color: '#F5EFE0',
                            minHeight: 24,
                            maxHeight: 120,
                            fontFamily: 'Inter, sans-serif',
                        }}
                    />
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 cursor-pointer"
                            style={{
                                background: 'rgba(197, 139, 7, 0.08)',
                                border: '1px solid rgba(197, 139, 7, 0.2)',
                                color: '#92783A',
                            }}
                            title="Voice input (coming soon)"
                        >
                            <Mic size={16} />
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || isLoading}
                            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            style={{
                                background: input.trim() ? 'linear-gradient(135deg, #C58B07, #E5B84A)' : 'rgba(197, 139, 7, 0.08)',
                                color: input.trim() ? '#02022d' : '#8A7A60',
                            }}
                        >
                            <Send size={16} />
                        </button>
                    </div>
                </div>
                <p className="text-center text-xs mt-2" style={{ color: '#5A4A30' }}>
                    NEXX provides legal information and strategic guidance, not legal advice.
                </p>
            </motion.div>
        </div>
    );
}
