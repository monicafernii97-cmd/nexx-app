'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
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
    CaretDown,
    Trash,
} from '@phosphor-icons/react';
import { formatDistanceToNow } from 'date-fns';
import { MODE_LABELS } from '@/lib/constants';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';
import { useWorkspace } from '@/lib/workspace-context';

/** Conversation list page with mode picker and new-chat creation. Ethereal theme. */
export default function ChatListPage() {
    const router = useRouter();
    const { activeCaseId } = useWorkspace();
    const conversations = useQuery(
        api.conversations.list,
        activeCaseId ? { caseId: activeCaseId } : 'skip'
    );
    const createConversation = useMutation(api.conversations.create);
    const removeConversation = useMutation(api.conversations.remove);
    const [isCreating, setIsCreating] = useState(false);
    const [isArchiveOpen, setIsArchiveOpen] = useState(false);
    const [deletingId, setDeletingId] = useState<Id<'conversations'> | null>(null);

    const handleDelete = async (e: React.MouseEvent, id: Id<'conversations'>) => {
        e.preventDefault();
        e.stopPropagation();
        if (deletingId) return; // prevent concurrent deletes
        if (window.confirm("Are you sure you want to permanently delete this session? This action cannot be undone.")) {
            setDeletingId(id);
            try {
                await removeConversation({ id });
            } catch (error) {
                console.error("Failed to delete conversation:", error);
            } finally {
                setDeletingId(null);
            }
        }
    };

    const handleNewChat = async () => {
        setIsCreating(true);
        try {
            const id = await createConversation({
                title: 'New Conversation',
                mode: 'general',
                caseId: activeCaseId!,
            });
            router.push(`/chat/${id}`);
        } catch (error) {
            console.error('Failed to create conversation:', error);
        } finally {
            setIsCreating(false);
        }
    };

    const isWorkspaceReady = activeCaseId !== null;

    const isLoadingConversations = conversations === undefined;
    const activeConversations = isLoadingConversations ? [] : conversations.filter((c) => c.status === 'active');
    const archivedConversations = isLoadingConversations ? [] : conversations.filter((c) => c.status === 'archived');

    return (
        <PageContainer>
            <PageHeader
                icon={ChatTeardropDots}
                title={
                    <>NEXX <span className="shimmer text-champagne font-light pl-2">Chat</span></>
                }
                description="Your elite strategic counsel. Unpack the manipulation, clarify boundaries, and build an ironclad strategy."
            />

            {/* New Chat Section (Glass Container) */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-ethereal p-6 mb-8 rounded-[2rem] border-white"
            >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h2 className="text-[12px] font-bold tracking-[0.2em] uppercase mb-4 text-sapphire flex items-center gap-2">
                            <ChatTeardropDots size={16} className="text-champagne" /> Start New Session
                        </h2>
                    </div>
                    
                    <button
                        onClick={handleNewChat}
                        disabled={isCreating || !isWorkspaceReady}
                        className="btn-primary shrink-0 py-3 px-6 text-[11px] uppercase tracking-widest flex items-center gap-2 disabled:scale-100 disabled:opacity-50 shadow-md transition-all self-start md:self-end"
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
                    <div className="card-premium p-10 text-center mb-8 flex flex-col items-center justify-center border-dashed">
                        <div
                            className="w-14 h-14 rounded-[1.25rem] mx-auto mb-5 flex items-center justify-center bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] shadow-[0_4px_25px_rgba(18,61,126,0.4)] border border-[rgba(255,255,255,0.1)] relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-white/10 opacity-0 hover:opacity-100 transition-opacity" />
                            <ChatCircleDots size={24} weight="duotone" className="text-white relative z-10" />
                        </div>
                        <p className="text-[14px] font-bold mb-2 text-sapphire">
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
                                    className="relative group"
                                >
                                    <Link href={`/chat/${conv._id}`} className="card-premium p-5 cursor-pointer block border hover:border-sapphire/20 transition-all shadow-sm hover:shadow-md">
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
                                                        className="text-[10px] tracking-widest font-bold py-1 px-3 rounded-full border border-white/10 shadow-sm"
                                                        style={{
                                                            background: `color-mix(in srgb, ${modeInfo.color} 15%, transparent)`,
                                                            backdropFilter: 'blur(8px)',
                                                            color: modeInfo.color,
                                                            borderColor: `color-mix(in srgb, ${modeInfo.color} 40%, transparent)`,
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
                                        </div>
                                    </Link>
                                    <button
                                        onClick={(e) => handleDelete(e, conv._id)}
                                        disabled={!!deletingId}
                                        title="Delete Chat"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-all duration-300 bg-white hover:bg-red-50 text-red-400 hover:text-red-500 shadow-sm border border-cloud z-20 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Trash size={16} weight="duotone" />
                                    </button>
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
                    <button
                        onClick={() => setIsArchiveOpen(!isArchiveOpen)}
                        aria-expanded={isArchiveOpen}
                        aria-controls="archived-conversations"
                        className="text-[12px] font-bold tracking-[0.2em] uppercase mb-4 flex items-center gap-2 text-sapphire-muted px-2 hover:text-sapphire transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60A5FA] focus-visible:rounded-md"
                    >
                        {isArchiveOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
                        <Archive size={16} /> Archived ({archivedConversations.length})
                    </button>
                    <AnimatePresence>
                        {isArchiveOpen && (
                            <motion.div
                                id="archived-conversations"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-10"
                            >
                                {archivedConversations.map((conv) => {
                                    const modeInfo = MODE_LABELS[conv.mode] || MODE_LABELS.general;
                                    return (
                                        <div key={conv._id} className="relative group/archived">
                                            <Link
                                                href={`/chat/${conv._id}`}
                                                className="card-premium p-4 cursor-pointer block hover:bg-white transition-colors"
                                            >
                                                <div className="flex items-center gap-4 pr-10">
                                                    <div
                                                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                                        style={{
                                                            background: `color-mix(in srgb, ${modeInfo.color} 10%, white)`,
                                                        }}
                                                    >
                                                        <Archive size={14} weight="duotone" style={{ color: modeInfo.color }} />
                                                    </div>
                                                    <p className="text-[14px] font-medium truncate flex-1 text-sapphire group-hover/archived:text-champagne transition-colors">
                                                        {conv.title}
                                                    </p>
                                                    <span
                                                        className="text-[10px] tracking-widest font-bold py-1 px-3 rounded-full border border-white/10 shadow-sm"
                                                        style={{
                                                            background: `color-mix(in srgb, ${modeInfo.color} 15%, transparent)`,
                                                            backdropFilter: 'blur(8px)',
                                                            color: modeInfo.color,
                                                            borderColor: `color-mix(in srgb, ${modeInfo.color} 40%, transparent)`,
                                                        }}
                                                    >
                                                        {modeInfo.label}
                                                    </span>
                                                </div>
                                            </Link>
                                            <button
                                                onClick={(e) => handleDelete(e, conv._id)}
                                                disabled={!!deletingId}
                                                title="Delete Chat"
                                                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover/archived:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-all duration-300 bg-white hover:bg-red-50 text-red-400 hover:text-red-500 shadow-sm border border-cloud shrink-0 disabled:opacity-50 disabled:cursor-not-allowed z-20"
                                            >
                                                <Trash size={14} weight="duotone" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}
        </PageContainer>
    );
}
