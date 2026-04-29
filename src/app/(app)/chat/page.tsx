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

            {/* New Chat Section */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="p-6 mb-8 rounded-2xl hyper-glass shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
            >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h2 className="text-[10px] font-bold tracking-widest uppercase mb-2 text-white/40 flex items-center gap-2">
                            <ChatTeardropDots size={14} className="text-white/60" /> Start New Session
                        </h2>
                        <p className="text-xs text-white/50 font-medium">Begin a new encrypted strategic dialogue.</p>
                    </div>
                    
                    <button
                        onClick={handleNewChat}
                        disabled={isCreating || !isWorkspaceReady}
                        className="py-3 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 disabled:scale-100 disabled:opacity-50 disabled:grayscale transition-all shadow-xl shadow-indigo-600/20 self-start md:self-end"
                    >
                        <Plus size={14} weight="bold" />
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
                <div className="flex items-center justify-between px-1 mb-5">
                    <h2 className="text-[10px] font-bold tracking-widest uppercase text-white/40">
                        Active Sessions
                    </h2>
                    <span 
                        className="bg-white/5 px-2 py-0.5 rounded text-[9px] font-bold text-white/60 border border-white/10"
                    >
                        {isLoadingConversations ? '…' : activeConversations.length}
                    </span>
                </div>

                {isLoadingConversations ? (
                    <div className="p-12 text-center mb-8 rounded-2xl hyper-glass border-dashed border-white/10">
                        <div className="flex flex-col items-center justify-center gap-4">
                            <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                            <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mt-2">
                                Loading securely...
                            </p>
                        </div>
                    </div>
                ) : activeConversations.length === 0 ? (
                    <div className="p-10 text-center mb-8 flex flex-col items-center justify-center rounded-2xl hyper-glass border-dashed border-white/10">
                        <div
                            className="w-10 h-10 rounded-xl mx-auto mb-4 flex items-center justify-center bg-white/5 border border-white/10"
                        >
                            <ChatCircleDots size={20} weight="regular" className="text-white/40" />
                        </div>
                        <p className="text-xs font-bold mb-1 text-white/80">
                            No conversations yet
                        </p>
                        <p className="text-[10px] font-medium text-white/40 max-w-xs mx-auto">
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
                                    <Link href={`/chat/${conv._id}`} className="p-4 rounded-xl block hyper-glass hover:shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition-all">
                                        <div className="flex items-start gap-4">
                                            <div
                                                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border border-white/10 bg-white/5"
                                            >
                                                <ChatTeardropDots size={16} weight="regular" className="text-white/60" />
                                            </div>
                                            <div className="flex-1 min-w-0 pr-4">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span
                                                        className="text-[9px] tracking-widest font-bold py-0.5 px-2 rounded bg-white/5 border border-white/10 text-white/60 uppercase"
                                                    >
                                                        {modeInfo.label}
                                                    </span>
                                                </div>
                                                <p className="text-sm font-bold truncate text-white/90 mb-1 group-hover:text-white transition-colors">
                                                    {conv.title}
                                                </p>
                                                <div className="flex items-center gap-3 text-white/40">
                                                    <div className="flex items-center gap-1.5">
                                                        <Clock size={10} weight="bold" />
                                                        <p className="text-[10px] font-medium uppercase tracking-wider">
                                                            {formatDistanceToNow(conv.lastMessageAt, { addSuffix: true })}
                                                        </p>
                                                    </div>
                                                    {conv.messageCount !== undefined && (
                                                        <>
                                                            <div className="w-1 h-1 rounded-full bg-white/20" />
                                                            <p className="text-[10px] font-medium uppercase tracking-wider">
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
                                        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 bg-white/5 hover:bg-red-500/10 text-white/40 hover:text-red-400 border border-white/10 z-20 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Trash size={14} weight="regular" />
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
                        className="text-[10px] font-bold tracking-widest uppercase mb-4 flex items-center gap-2 text-white/40 px-1 hover:text-white/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                    >
                        {isArchiveOpen ? <CaretDown size={14} /> : <CaretRight size={14} />}
                        <Archive size={14} /> Archived ({archivedConversations.length})
                    </button>
                    <AnimatePresence>
                        {isArchiveOpen && (
                            <motion.div
                                id="archived-conversations"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-10 overflow-hidden"
                            >
                                {archivedConversations.map((conv) => {
                                    const modeInfo = MODE_LABELS[conv.mode] || MODE_LABELS.general;
                                    return (
                                        <div key={conv._id} className="relative group/archived">
                                            <Link
                                                href={`/chat/${conv._id}`}
                                                className="p-3 rounded-xl block hyper-glass hover:shadow-lg transition-all"
                                            >
                                                <div className="flex items-center gap-3 pr-10">
                                                    <div
                                                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-white/5 border border-white/5"
                                                    >
                                                        <Archive size={14} weight="regular" className="text-white/40" />
                                                    </div>
                                                    <p className="text-xs font-medium truncate flex-1 text-white/60 group-hover/archived:text-white/90 transition-colors">
                                                        {conv.title}
                                                    </p>
                                                    <span
                                                        className="text-[9px] tracking-widest font-bold py-0.5 px-2 rounded bg-white/5 border border-white/10 text-white/40 uppercase"
                                                    >
                                                        {modeInfo.label}
                                                    </span>
                                                </div>
                                            </Link>
                                            <button
                                                onClick={(e) => handleDelete(e, conv._id)}
                                                disabled={!!deletingId}
                                                title="Delete Chat"
                                                className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover/archived:opacity-100 transition-all duration-300 bg-white/5 hover:bg-red-500/10 text-white/40 hover:text-red-400 border border-white/5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed z-20"
                                            >
                                                <Trash size={12} weight="regular" />
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
