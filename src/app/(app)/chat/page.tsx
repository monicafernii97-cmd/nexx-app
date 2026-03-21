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
    ChatTeardropDots,
    Clock,
    Archive,
    CaretRight,
} from '@phosphor-icons/react';
import { formatDistanceToNow } from 'date-fns';
import { MODE_LABELS } from '@/lib/constants';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';

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
        <PageContainer>
            <PageHeader
                icon={ChatTeardropDots}
                title={
                    <>NEXX <span className="shimmer text-champagne font-light pl-2">Intelligence</span></>
                }
                description="Strategic AI counsel — your conversations are encrypted and private."
            />

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
                            <ChatTeardropDots size={16} className="text-champagne" /> Start New Session
                        </h2>
                        <div className="flex flex-wrap gap-2.5">
                            {Object.entries(MODE_LABELS).map(([key, { label, color }]) => (
                                <button
                                    key={key}
                                    onClick={() => setSelectedMode(key as typeof selectedMode)}
                                    aria-pressed={selectedMode === key}
                                    className={`relative px-5 py-2.5 rounded-xl cursor-pointer font-bold tracking-wide transition-all duration-300 overflow-hidden active:scale-95 border backdrop-blur-xl hover:-translate-y-0.5 z-10`}
                                    style={{
                                        background: selectedMode === key ? `color-mix(in srgb, ${color} 40%, rgba(255,255,255,0.15))` : 'rgba(255,255,255,0.03)',
                                        color: selectedMode === key ? '#FFFFFF' : 'rgba(255,255,255,0.6)',
                                        borderColor: selectedMode === key ? `rgba(255,255,255,0.4)` : 'rgba(255,255,255,0.1)',
                                        boxShadow: selectedMode === key ? `inset 0 4px 15px rgba(255,255,255,0.1), inset 0 -4px 15px rgba(0,0,0,0.1), 0 8px 20px rgba(0,0,0,0.3)` : 'inset 0 2px 4px rgba(255,255,255,0.05), 0 4px 10px rgba(0,0,0,0.1)',
                                    }}
                                >
                                    <span className="relative z-20 drop-shadow-md">{label}</span>
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
                    <span 
                        className="bg-white px-2 py-1 rounded-md shadow-[0_2px_4px_rgba(10,22,41,0.02)] border border-[rgba(10,22,41,0.06)] text-[12px] font-black"
                        style={{ color: '#0A1128' }}
                    >
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
                            className="w-20 h-20 rounded-[2rem] mx-auto mb-6 flex items-center justify-center bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] shadow-[0_4px_25px_rgba(18,61,126,0.4)] border border-[rgba(255,255,255,0.1)] relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-white/10 opacity-0 hover:opacity-100 transition-opacity" />
                            <ChatCircleDots size={36} weight="duotone" className="text-white relative z-10" />
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
                                                <ChatTeardropDots size={20} weight="duotone" style={{ color: modeInfo.color }} />
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
        </PageContainer>
    );
}
