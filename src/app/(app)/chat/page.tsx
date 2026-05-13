'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Doc, Id } from '@convex/_generated/dataModel';
import type { MouseEvent } from 'react';
import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
    Archive,
    ChatCircleDots,
    ChatTeardropDots,
    Clock,
    Plus,
    SidebarSimple,
    Trash,
    X,
} from '@phosphor-icons/react';
import { formatDistanceToNow } from 'date-fns';
import ChatInput from '@/components/chat/ChatInput';
import { PageContainer } from '@/components/layout/PageLayout';
import { useWorkspace } from '@/lib/workspace-context';
import { consumeCourtHandoff, buildHandoffPrompt, HANDOFF_FALLBACK_MESSAGE } from '@/lib/exports/courtHandoff';

type ConversationDoc = Doc<'conversations'>;

/** Refined chat landing page with a default new-chat workspace and compact history drawer. */
export default function ChatListPage() {
    return (
        <Suspense fallback={null}>
            <ChatListContent />
        </Suspense>
    );
}

/** Inner content separated so URL search params stay wrapped in Suspense. */
function ChatListContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { activeCaseId } = useWorkspace();
    const conversations = useQuery(
        api.conversations.list,
        activeCaseId ? { caseId: activeCaseId } : 'skip'
    );
    const createConversation = useMutation(api.conversations.create);
    const removeConversation = useMutation(api.conversations.remove);
    const [isCreating, setIsCreating] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [deletingId, setDeletingId] = useState<Id<'conversations'> | null>(null);
    const handoffProcessedRef = useRef(false);

    useEffect(() => {
        if (handoffProcessedRef.current) return;
        if (searchParams.get('handoff') !== 'court') return;
        if (!activeCaseId) return;
        handoffProcessedRef.current = true;

        const payload = consumeCourtHandoff();

        (async () => {
            try {
                const id = await createConversation({
                    title: payload ? 'Court Document Issue Resolution' : 'Court Document Help',
                    mode: 'legal',
                    caseId: activeCaseId,
                });

                const msgKey = `nexx_handoff_msg_${String(id)}`;
                sessionStorage.setItem(msgKey, payload ? buildHandoffPrompt(payload) : HANDOFF_FALLBACK_MESSAGE);

                router.replace(`/chat/${id}`);
            } catch (err) {
                console.error('[ChatList] Failed to create handoff conversation:', err);
                handoffProcessedRef.current = false;
            }
        })();
    }, [searchParams, activeCaseId, createConversation, router]);

    const isWorkspaceReady = activeCaseId !== null;
    const isLoadingConversations = conversations === undefined;
    const activeConversations = isLoadingConversations ? [] : conversations.filter((c) => c.status === 'active');
    const archivedConversations = isLoadingConversations ? [] : conversations.filter((c) => c.status === 'archived');
    const totalConversations = activeConversations.length + archivedConversations.length;

    const createBlankConversation = async () => {
        if (!activeCaseId || isCreating) return;
        setIsCreating(true);
        try {
            const id = await createConversation({
                title: 'New Conversation',
                mode: 'general',
                caseId: activeCaseId,
            });
            router.push(`/chat/${id}`);
        } catch (error) {
            console.error('Failed to create conversation:', error);
        } finally {
            setIsCreating(false);
        }
    };

    const handleSendNewChat = async (message: string) => {
        if (!activeCaseId || isCreating) return;
        setIsCreating(true);
        try {
            const id = await createConversation({
                title: 'New Conversation',
                mode: 'general',
                caseId: activeCaseId,
            });
            sessionStorage.setItem(`nexx_initial_msg_${String(id)}`, message);
            router.push(`/chat/${id}`);
        } catch (error) {
            console.error('Failed to start conversation:', error);
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (e: MouseEvent, id: Id<'conversations'>) => {
        e.preventDefault();
        e.stopPropagation();
        if (deletingId) return;
        if (!window.confirm('Delete this conversation permanently? This cannot be undone.')) return;

        setDeletingId(id);
        try {
            await removeConversation({ id });
        } catch (error) {
            console.error('Failed to delete conversation:', error);
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <PageContainer lockHeight>
            <div className="flex min-h-0 flex-1 flex-col">
                <header className="mb-6 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <div className="mb-3 flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
                                <ChatTeardropDots size={20} weight="regular" className="text-indigo-300" />
                            </div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/35">
                                Nexx Chat
                            </p>
                        </div>
                        <h1 className="font-serif text-3xl leading-tight tracking-tight text-white md:text-4xl">
                            What do you want to work through?
                        </h1>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsHistoryOpen(true)}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[11px] font-bold uppercase tracking-widest text-white/65 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
                        aria-label="Open chat history"
                    >
                        <SidebarSimple size={16} />
                        <span className="hidden sm:inline">History</span>
                        <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-white/45">
                            {isLoadingConversations ? '...' : totalConversations}
                        </span>
                    </button>
                </header>

                <main className="flex min-h-0 flex-1 flex-col justify-center">
                    <motion.section
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mx-auto flex w-full max-w-3xl flex-col gap-5"
                    >
                        <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.045] p-2 shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
                            <ChatInput
                                onSend={handleSendNewChat}
                                disabled={!isWorkspaceReady || isCreating}
                                placeholder={isCreating ? 'Opening a new conversation...' : 'Ask NEXX anything...'}
                            />
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <button
                                type="button"
                                onClick={createBlankConversation}
                                disabled={!isWorkspaceReady || isCreating}
                                className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-[10px] font-bold uppercase tracking-widest text-white/55 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                            >
                                <Plus size={14} />
                                {isCreating ? 'Opening' : 'Blank Chat'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsHistoryOpen(true)}
                                className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[10px] font-bold uppercase tracking-widest text-white/45 transition hover:bg-white/[0.04] hover:text-white/75"
                            >
                                <Clock size={14} />
                                Recent Conversations
                            </button>
                        </div>
                    </motion.section>
                </main>
            </div>

            <HistoryDrawer
                open={isHistoryOpen}
                onClose={() => setIsHistoryOpen(false)}
                isLoading={isLoadingConversations}
                activeConversations={activeConversations}
                archivedConversations={archivedConversations}
                deletingId={deletingId}
                onDelete={handleDelete}
            />
        </PageContainer>
    );
}

interface HistoryDrawerProps {
    open: boolean;
    onClose: () => void;
    isLoading: boolean;
    activeConversations: ConversationDoc[];
    archivedConversations: ConversationDoc[];
    deletingId: Id<'conversations'> | null;
    onDelete: (e: MouseEvent, id: Id<'conversations'>) => void;
}

/** Compact history drawer that keeps conversation volume out of the main workspace. */
function HistoryDrawer({
    open,
    onClose,
    isLoading,
    activeConversations,
    archivedConversations,
    deletingId,
    onDelete,
}: HistoryDrawerProps) {
    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.button
                        type="button"
                        aria-label="Close chat history"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]"
                    />
                    <motion.aside
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                        className="fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[23rem] flex-col border-l border-white/10 bg-[#10121c]/95 p-4 shadow-[-24px_0_80px_rgba(0,0,0,0.35)] backdrop-blur-xl"
                        aria-label="Chat history"
                        aria-modal="true"
                        role="dialog"
                    >
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/35">
                                    History
                                </p>
                                <h2 className="mt-1 text-lg font-semibold text-white">Conversations</h2>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/55 transition hover:bg-white/[0.08] hover:text-white"
                                aria-label="Close history"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                            {isLoading ? (
                                <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 bg-white/[0.025]">
                                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-white/55" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">
                                        Loading
                                    </p>
                                </div>
                            ) : activeConversations.length === 0 && archivedConversations.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.025] p-8 text-center">
                                    <ChatCircleDots size={22} className="mx-auto mb-3 text-white/35" />
                                    <p className="text-sm font-semibold text-white/75">No conversations yet</p>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <ConversationSection
                                        title="Recent"
                                        conversations={activeConversations}
                                        deletingId={deletingId}
                                        onDelete={onDelete}
                                    />
                                    {archivedConversations.length > 0 && (
                                        <ConversationSection
                                            title="Archived"
                                            conversations={archivedConversations}
                                            deletingId={deletingId}
                                            onDelete={onDelete}
                                            archived
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}

function ConversationSection({
    title,
    conversations,
    deletingId,
    onDelete,
    archived = false,
}: {
    title: string;
    conversations: ConversationDoc[];
    deletingId: Id<'conversations'> | null;
    onDelete: (e: MouseEvent, id: Id<'conversations'>) => void;
    archived?: boolean;
}) {
    if (conversations.length === 0) return null;

    return (
        <section>
            <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">{title}</p>
                <span className="text-[10px] font-semibold text-white/30">{conversations.length}</span>
            </div>
            <div className="space-y-1.5">
                {conversations.map((conversation) => (
                    <div key={conversation._id} className="group relative">
                        <Link
                            href={`/chat/${conversation._id}`}
                            className="block rounded-xl border border-transparent px-3 py-2.5 transition hover:border-white/10 hover:bg-white/[0.045]"
                        >
                            <div className="flex items-start gap-3 pr-8">
                            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-white/45">
                                {archived ? <Archive size={14} /> : <ChatTeardropDots size={14} />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-white/80 group-hover:text-white">
                                    {conversation.title}
                                </p>
                                <p className="mt-1 truncate text-[11px] text-white/35">
                                    {formatDistanceToNow(conversation.lastMessageAt, { addSuffix: true })}
                                    {conversation.messageCount !== undefined && ` - ${conversation.messageCount} messages`}
                                </p>
                            </div>
                            </div>
                        </Link>
                        <button
                            type="button"
                            onClick={(e) => onDelete(e, conversation._id)}
                            disabled={!!deletingId}
                            title="Delete conversation"
                            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-white/30 opacity-100 transition hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100"
                        >
                            <Trash size={13} />
                        </button>
                    </div>
                ))}
            </div>
        </section>
    );
}
