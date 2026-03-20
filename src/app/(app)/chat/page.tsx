'use client';

import { motion } from 'framer-motion';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ChatCircleDots,
    Plus,
    Sparkle,
    Clock,
    Archive,
    CaretRight,
} from '@phosphor-icons/react';
import { formatDistanceToNow } from 'date-fns';
import { MODE_LABELS } from '@/lib/constants';

/** Conversation list page with mode picker and new-chat creation. Ethereal theme. */
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
        <div className="max-w-4xl mx-auto pb-16 px-2">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex items-start justify-between mb-10 pt-4"
            >
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <div
                            className="w-12 h-12 rounded-[1rem] flex items-center justify-center bg-white shadow-[0_8px_30px_rgba(208,227,255,0.4)] border border-[rgba(10,22,41,0.04)]"
                        >
                            <Sparkle size={24} weight="duotone" className="text-champagne" />
                        </div>
                        <h1 className="text-3xl font-serif font-bold text-sapphire m-0 leading-tight">
                            NEXX <span className="shimmer text-champagne font-light">Intelligence</span>
                        </h1>
                    </div>
                    <p className="text-[15px] font-medium text-sapphire-muted ml-[64px]">
                        Strategic AI counsel — your conversations are encrypted and private.
                    </p>
                </div>
            </motion.div>

            {/* New Chat Section (Glass Container) */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-ethereal p-8 mb-10 rounded-[2rem] border-white"
            >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h2 className="text-[12px] font-bold tracking-[0.2em] uppercase mb-4 text-sapphire flex items-center gap-2">
                            <Sparkle size={16} className="text-champagne" /> Start New Session
                        </h2>
                        <div className="flex flex-wrap gap-2.5">
                            {Object.entries(MODE_LABELS).map(([key, { label, color }]) => (
                                <button
                                    key={key}
                                    onClick={() => setSelectedMode(key as typeof selectedMode)}
                                    aria-pressed={selectedMode === key}
                                    className="badge cursor-pointer transition-all px-4 py-2 border shadow-sm text-[12px]"
                                    style={{
                                        background: selectedMode === key ? `color-mix(in srgb, ${color} 15%, white)` : 'white',
                                        color: selectedMode === key ? color : 'var(--sapphire-muted)',
                                        borderColor: selectedMode === key ? `color-mix(in srgb, ${color} 40%, transparent)` : 'transparent',
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <button
                        onClick={handleNewChat}
                        disabled={isCreating}
                        className="btn-primary shrink-0 py-4 px-8 text-[13px] uppercase tracking-widest flex items-center gap-2 disabled:scale-100 disabled:opacity-50 shadow-md transition-all self-start md:self-end"
                    >
                        <Plus size={16} weight="bold" />
                        {isCreating ? 'Initializing...' : 'New Session'}
                    </button>
                </div>
            </motion.div>

            {/* Active Conversations */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <h2 className="text-[12px] font-bold tracking-[0.2em] uppercase mb-5 text-sapphire px-2 flex items-center justify-between">
                    <span>Active Sessions</span>
                    <span className="bg-white px-2 py-0.5 rounded-md shadow-sm border border-[rgba(10,22,41,0.04)] text-sapphire-muted">
                        {isLoadingConversations ? '…' : activeConversations.length}
                    </span>
                </h2>

                {isLoadingConversations ? (
                    <div className="card-premium p-12 text-center mb-8 border-dashed">
                        <div className="flex flex-col items-center justify-center gap-4">
                            <div className="w-10 h-10 rounded-full border-2 border-sapphire border-t-transparent animate-spin" />
                            <p className="text-[13px] font-bold uppercase tracking-widest text-sapphire mt-2">
                                Loading securely...
                            </p>
                        </div>
                    </div>
                ) : activeConversations.length === 0 ? (
                    <div className="card-premium p-12 text-center mb-8 flex flex-col items-center justify-center border-dashed">
                        <div
                            className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center bg-white shadow-[0_8px_30px_rgba(208,227,255,0.4)] border border-[rgba(10,22,41,0.04)]"
                        >
                            <ChatCircleDots size={32} weight="duotone" className="text-sapphire" />
                        </div>
                        <p className="text-[16px] font-bold mb-2 text-sapphire">
                            No conversations yet
                        </p>
                        <p className="text-[14px] font-medium text-sapphire-muted max-w-xs mx-auto">
                            Start your first session with NEXX to access elite strategic counsel.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                        {activeConversations.map((conv, i) => {
                            const modeInfo = MODE_LABELS[conv.mode] || MODE_LABELS.general;
                            return (
                                <motion.div
                                    key={conv._id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.05 * i }}
                                >
                                    <Link href={`/chat/${conv._id}`} className="card-premium p-5 cursor-pointer group block border hover:border-sapphire/20 transition-all shadow-sm hover:shadow-md">
                                        <div className="flex items-start gap-4">
                                            <div
                                                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
                                                style={{
                                                    background: `color-mix(in srgb, ${modeInfo.color} 15%, white)`,
                                                    border: `1px solid color-mix(in srgb, ${modeInfo.color} 30%, transparent)`,
                                                }}
                                            >
                                                <Sparkle size={20} weight="duotone" style={{ color: modeInfo.color }} />
                                            </div>
                                            <div className="flex-1 min-w-0 pr-4">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span
                                                        className="badge text-[10px] tracking-wider font-bold py-1 px-2"
                                                        style={{
                                                            background: `color-mix(in srgb, ${modeInfo.color} 10%, white)`,
                                                            color: modeInfo.color,
                                                        }}
                                                    >
                                                        {modeInfo.label}
                                                    </span>
                                                </div>
                                                <p className="text-[15px] font-bold truncate text-sapphire mb-1 group-hover:text-champagne transition-colors">
                                                    {conv.title}
                                                </p>
                                                <div className="flex items-center gap-3 text-sapphire-muted">
                                                    <div className="flex items-center gap-1.5">
                                                        <Clock size={12} weight="bold" />
                                                        <p className="text-[12px] font-medium">
                                                            {formatDistanceToNow(conv.lastMessageAt, { addSuffix: true })}
                                                        </p>
                                                    </div>
                                                    {conv.messageCount !== undefined && (
                                                        <>
                                                            <div className="w-1 h-1 rounded-full bg-cloud" />
                                                            <p className="text-[12px] font-medium">
                                                                {conv.messageCount} msg
                                                            </p>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0 mt-2">
                                                <CaretRight size={14} weight="bold" className="text-sapphire" />
                                            </div>
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
                    <h2 className="text-[12px] font-bold tracking-[0.2em] uppercase mb-4 flex items-center gap-2 text-sapphire-muted px-2">
                        <Archive size={16} /> Archived ({archivedConversations.length})
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 opacity-60 hover:opacity-100 transition-opacity">
                        {archivedConversations.map((conv) => {
                            const modeInfo = MODE_LABELS[conv.mode] || MODE_LABELS.general;
                            return (
                                <Link
                                    key={conv._id}
                                    href={`/chat/${conv._id}`}
                                    className="card-premium p-4 cursor-pointer block hover:bg-white transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <div
                                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                            style={{
                                                background: `color-mix(in srgb, ${modeInfo.color} 10%, white)`,
                                            }}
                                        >
                                            <Archive size={14} weight="duotone" style={{ color: modeInfo.color }} />
                                        </div>
                                        <p className="text-[14px] font-medium truncate flex-1 text-sapphire">
                                            {conv.title}
                                        </p>
                                        <span
                                            className="badge text-[10px] font-bold tracking-wider"
                                            style={{
                                                background: `color-mix(in srgb, ${modeInfo.color} 10%, white)`,
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
