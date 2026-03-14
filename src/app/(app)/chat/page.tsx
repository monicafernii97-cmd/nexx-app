'use client';

import { motion } from 'framer-motion';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    MessageCircle,
    Plus,
    Sparkles,
    Clock,
    Archive,
    ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { MODE_LABELS } from '@/lib/constants';

export default function ChatListPage() {
    const router = useRouter();
    const conversations = useQuery(api.conversations.list, {});
    const createConversation = useMutation(api.conversations.create);
    const [selectedMode, setSelectedMode] = useState<'therapeutic' | 'legal' | 'strategic' | 'general'>('general');
    const [isCreating, setIsCreating] = useState(false);

    const handleNewChat = async () => {
        setIsCreating(true);
        try {
            const id = await createConversation({
                title: 'New Conversation',
                mode: selectedMode,
            });
            router.push(`/chat/${id}`);
        } catch (error) {
            console.error('Failed to create conversation:', error);
        } finally {
            setIsCreating(false);
        }
    };

    const isLoadingConversations = conversations === undefined;
    const activeConversations = isLoadingConversations ? [] : conversations.filter((c) => c.status === 'active');
    const archivedConversations = isLoadingConversations ? [] : conversations.filter((c) => c.status === 'archived');

    return (
        <div className="max-w-4xl mx-auto">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start justify-between mb-8"
            >
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{
                                background: 'linear-gradient(135deg, #F7F2EB, #123D7E)',
                                boxShadow: '0 2px 12px rgba(208, 227, 255, 0.25)',
                            }}
                        >
                            <Sparkles size={18} style={{ color: '#F7F2EB' }} />
                        </div>
                        <h1 className="text-headline text-2xl" style={{ color: '#F7F2EB' }}>
                            NEXX Intelligence
                        </h1>
                    </div>
                    <p className="text-sm" style={{ color: '#FFF9F0' }}>
                        Strategic AI counsel — your conversations are encrypted and private.
                    </p>
                </div>
            </motion.div>

            {/* New Chat Section */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="card-premium p-6 mb-8"
            >
                <h2
                    className="text-sm font-semibold tracking-[0.15em] uppercase mb-4"
                    style={{ color: '#D0E3FF' }}
                >
                    Start New Session
                </h2>
                <div className="flex flex-wrap gap-2 mb-4">
                    {Object.entries(MODE_LABELS).map(([key, { label, color }]) => (
                        <button
                            key={key}
                            onClick={() => setSelectedMode(key as typeof selectedMode)}
                            aria-pressed={selectedMode === key}
                            className="badge cursor-pointer transition-all"
                            style={{
                                background:
                                    selectedMode === key
                                        ? `${color}25`
                                        : 'rgba(138, 122, 96, 0.08)',
                                color: selectedMode === key ? color : '#FFF9F0',
                                border: `1px solid ${selectedMode === key ? `${color}40` : 'transparent'}`,
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <button
                    onClick={handleNewChat}
                    disabled={isCreating}
                    className="btn-primary text-xs flex items-center gap-2 disabled:opacity-40"
                >
                    <Plus size={14} />
                    {isCreating ? 'Creating...' : 'New Conversation'}
                </button>
            </motion.div>

            {/* Active Conversations */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <h2
                    className="text-sm font-semibold tracking-[0.15em] uppercase mb-4"
                    style={{ color: '#D0E3FF' }}
                >
                    Active Sessions ({isLoadingConversations ? '…' : activeConversations.length})
                </h2>

                {isLoadingConversations ? (
                    <div className="card-premium p-8 text-center mb-8">
                        <div className="flex gap-1.5 justify-center">
                            {[0, 1, 2].map((j) => (
                                <motion.div
                                    key={j}
                                    className="w-2 h-2 rounded-full"
                                    style={{ background: '#F7F2EB' }}
                                    animate={{ opacity: [0.3, 1, 0.3] }}
                                    transition={{ duration: 1, repeat: Infinity, delay: j * 0.2 }}
                                />
                            ))}
                        </div>
                        <p className="text-sm font-medium mt-3" style={{ color: '#D0E3FF' }}>
                            Loading conversations…
                        </p>
                    </div>
                ) : activeConversations.length === 0 ? (
                    <div className="card-premium p-8 text-center mb-8">
                        <div
                            className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                            style={{
                                background: 'rgba(208, 227, 255, 0.08)',
                                border: '1px solid rgba(208, 227, 255, 0.15)',
                            }}
                        >
                            <MessageCircle size={28} style={{ color: '#FFF9F0' }} />
                        </div>
                        <p className="text-sm font-medium mb-2" style={{ color: '#D0E3FF' }}>
                            No conversations yet
                        </p>
                        <p className="text-xs" style={{ color: '#FFF9F0' }}>
                            Start your first session with NEXX to get strategic counsel.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3 mb-8">
                        {activeConversations.map((conv, i) => {
                            const modeInfo = MODE_LABELS[conv.mode] || MODE_LABELS.general;
                            return (
                                <motion.div
                                    key={conv._id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.05 * i }}
                                >
                                    <Link href={`/chat/${conv._id}`} className="card-premium p-4 cursor-pointer group block">
                                        <div className="flex items-center gap-4">
                                            <div
                                                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                                style={{
                                                    background: `${modeInfo.color}15`,
                                                    border: `1px solid ${modeInfo.color}30`,
                                                }}
                                            >
                                                <Sparkles size={16} style={{ color: modeInfo.color }} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p
                                                        className="text-sm font-semibold truncate"
                                                        style={{ color: '#F7F2EB' }}
                                                    >
                                                        {conv.title}
                                                    </p>
                                                    <span
                                                        className="badge text-xs"
                                                        style={{
                                                            background: `${modeInfo.color}20`,
                                                            color: modeInfo.color,
                                                        }}
                                                    >
                                                        {modeInfo.label}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Clock size={10} style={{ color: '#FFF9F0' }} />
                                                    <p className="text-xs" style={{ color: '#FFF9F0' }}>
                                                        {formatDistanceToNow(conv.lastMessageAt, {
                                                            addSuffix: true,
                                                        })}
                                                    </p>
                                                    {conv.messageCount !== undefined && (
                                                        <p className="text-xs" style={{ color: '#FFF9F0' }}>
                                                            · {conv.messageCount} messages
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <ChevronRight
                                                size={14}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                style={{ color: '#F7F2EB' }}
                                            />
                                        </div>
                                    </Link>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </motion.div>

            {/* Archived */}
            {archivedConversations.length > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                >
                    <h2
                        className="text-sm font-semibold tracking-[0.15em] uppercase mb-4 flex items-center gap-2"
                        style={{ color: '#5A4A30' }}
                    >
                        <Archive size={14} /> Archived ({archivedConversations.length})
                    </h2>
                    <div className="space-y-3 opacity-60">
                        {archivedConversations.map((conv) => {
                            const modeInfo = MODE_LABELS[conv.mode] || MODE_LABELS.general;
                            return (
                                <Link
                                    key={conv._id}
                                    href={`/chat/${conv._id}`}
                                    className="card-premium p-3 cursor-pointer block"
                                >
                                    <div className="flex items-center gap-3">
                                        <p className="text-sm truncate flex-1" style={{ color: '#D0E3FF' }}>
                                            {conv.title}
                                        </p>
                                        <span
                                            className="badge text-xs"
                                            style={{
                                                background: `${modeInfo.color}15`,
                                                color: modeInfo.color,
                                            }}
                                        >
                                            {modeInfo.label}
                                        </span>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </motion.div>
            )}
        </div>
    );
}
