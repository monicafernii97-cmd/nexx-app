'use client';

import { motion } from 'framer-motion';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ChatCircle,
    Plus,
    Lightning,
    Clock,
    Archive,
    CaretRight,
} from '@phosphor-icons/react';
import { formatDistanceToNow } from 'date-fns';
import { MODE_LABELS } from '@/lib/constants';

/** Stagger animation variants. */
const stagger = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 20 } },
};

/** Conversation list page with mode picker and new-chat creation. */
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
        <div className="max-w-4xl">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                className="flex items-start justify-between mb-8"
            >
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{
                                background: 'rgba(16, 185, 129, 0.08)',
                                border: '1px solid rgba(16, 185, 129, 0.12)',
                            }}
                        >
                            <Lightning size={18} weight="duotone" style={{ color: 'var(--emerald-500)' }} />
                        </div>
                        <h1 className="text-headline text-2xl" style={{ color: 'var(--zinc-100)' }}>
                            NEXX Intelligence
                        </h1>
                    </div>
                    <p className="text-sm" style={{ color: 'var(--zinc-500)' }}>
                        Strategic AI counsel — your conversations are encrypted and private.
                    </p>
                </div>
            </motion.div>

            {/* New Chat Section */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 20 }}
                className="card-premium p-6 mb-8"
            >
                <h2
                    className="text-xs font-semibold tracking-[0.15em] uppercase mb-4"
                    style={{ color: 'var(--zinc-400)' }}
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
                                        ? `${color}18`
                                        : 'rgba(244, 244, 245, 0.6)',
                                color: selectedMode === key ? color : 'var(--zinc-500)',
                                border: `1px solid ${selectedMode === key ? `${color}30` : 'transparent'}`,
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
                    <Plus size={14} weight="bold" />
                    {isCreating ? 'Creating...' : 'New Conversation'}
                </button>
            </motion.div>

            {/* Active Conversations */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 20 }}
            >
                <h2
                    className="text-xs font-semibold tracking-[0.15em] uppercase mb-4"
                    style={{ color: 'var(--zinc-500)' }}
                >
                    Active Sessions ({isLoadingConversations ? '...' : activeConversations.length})
                </h2>

                {isLoadingConversations ? (
                    <div className="card-premium p-8 text-center mb-8">
                        <div className="flex gap-1.5 justify-center">
                            {[0, 1, 2].map((j) => (
                                <motion.div
                                    key={j}
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ background: 'var(--zinc-300)' }}
                                    animate={{ opacity: [0.3, 1, 0.3] }}
                                    transition={{ duration: 1, repeat: Infinity, delay: j * 0.15 }}
                                />
                            ))}
                        </div>
                        <p className="text-sm font-medium mt-3" style={{ color: 'var(--zinc-400)' }}>
                            Loading conversations...
                        </p>
                    </div>
                ) : activeConversations.length === 0 ? (
                    <div className="card-premium p-10 text-center mb-8">
                        <div
                            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                            style={{
                                background: 'rgba(16, 185, 129, 0.06)',
                                border: '1px solid rgba(16, 185, 129, 0.1)',
                            }}
                        >
                            <ChatCircle size={24} weight="duotone" style={{ color: 'var(--emerald-500)' }} />
                        </div>
                        <p className="text-sm font-medium mb-2" style={{ color: 'var(--zinc-700)' }}>
                            No conversations yet
                        </p>
                        <p className="text-xs" style={{ color: 'var(--zinc-400)' }}>
                            Start your first session with NEXX to get strategic counsel.
                        </p>
                    </div>
                ) : (
                    <motion.div
                        variants={stagger}
                        initial="hidden"
                        animate="visible"
                        className="card-premium overflow-hidden divide-y divide-zinc-100 mb-8"
                    >
                        {activeConversations.map((conv) => {
                            const modeInfo = MODE_LABELS[conv.mode] || MODE_LABELS.general;
                            return (
                                <motion.div key={conv._id} variants={fadeUp}>
                                    <Link href={`/chat/${conv._id}`} className="block no-underline">
                                        <div className="px-6 py-4 group cursor-pointer hover:bg-zinc-50/50 transition-colors duration-200">
                                            <div className="flex items-center gap-4">
                                                <div
                                                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                                    style={{
                                                        background: `${modeInfo.color}0A`,
                                                        border: `1px solid ${modeInfo.color}15`,
                                                    }}
                                                >
                                                    <Lightning size={16} weight="duotone" style={{ color: modeInfo.color }} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--zinc-900)' }}>
                                                            {conv.title}
                                                        </p>
                                                        <span
                                                            className="badge text-xs"
                                                            style={{
                                                                background: `${modeInfo.color}12`,
                                                                color: modeInfo.color,
                                                            }}
                                                        >
                                                            {modeInfo.label}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Clock size={10} style={{ color: 'var(--zinc-400)' }} />
                                                        <p className="text-xs" style={{ color: 'var(--zinc-400)' }}>
                                                            {formatDistanceToNow(conv.lastMessageAt, {
                                                                addSuffix: true,
                                                            })}
                                                        </p>
                                                        {conv.messageCount !== undefined && (
                                                            <p className="text-xs" style={{ color: 'var(--zinc-400)' }}>
                                                                · {conv.messageCount} messages
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <CaretRight
                                                    size={14}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                                    style={{ color: 'var(--zinc-400)' }}
                                                />
                                            </div>
                                        </div>
                                    </Link>
                                </motion.div>
                            );
                        })}
                    </motion.div>
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
                        className="text-xs font-semibold tracking-[0.15em] uppercase mb-4 flex items-center gap-2"
                        style={{ color: 'var(--zinc-500)' }}
                    >
                        <Archive size={14} /> Archived ({archivedConversations.length})
                    </h2>
                    <div className="card-premium overflow-hidden divide-y divide-zinc-100 opacity-60">
                        {archivedConversations.map((conv) => {
                            const modeInfo = MODE_LABELS[conv.mode] || MODE_LABELS.general;
                            return (
                                <Link
                                    key={conv._id}
                                    href={`/chat/${conv._id}`}
                                    className="block no-underline"
                                >
                                    <div className="px-6 py-3 hover:bg-zinc-50/50 transition-colors duration-200">
                                        <div className="flex items-center gap-3">
                                            <p className="text-sm truncate flex-1" style={{ color: 'var(--zinc-500)' }}>
                                                {conv.title}
                                            </p>
                                            <span
                                                className="badge text-xs"
                                                style={{
                                                    background: `${modeInfo.color}0A`,
                                                    color: modeInfo.color,
                                                }}
                                            >
                                                {modeInfo.label}
                                            </span>
                                        </div>
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
