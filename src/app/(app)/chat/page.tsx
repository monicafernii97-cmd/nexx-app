'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Doc, Id } from '@convex/_generated/dataModel';
import type { MouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
    Archive,
    ChatCircleDots,
    ChatTeardropDots,
    SidebarSimple,
    Trash,
    X,
} from '@phosphor-icons/react';
import { formatDistanceToNow } from 'date-fns';
import ChatInput, { type ChatInputUploadCallbacks } from '@/components/chat/ChatInput';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';
import { useWorkspace } from '@/lib/workspace-context';
import { consumeCourtHandoff, buildHandoffPrompt, HANDOFF_FALLBACK_MESSAGE } from '@/lib/exports/courtHandoff';
import type { ChatAttachmentRef } from '@/lib/chat/uploadConfig';
import { type ChatComposerFileState, uploadFileForConversation } from '@/lib/chat/uploadClient';

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
    const convex = useConvex();
    const conversations = useQuery(
        api.conversations.list,
        activeCaseId ? { caseId: activeCaseId } : 'skip'
    );
    const createConversation = useMutation(api.conversations.create);
    const createDraftConversation = useMutation(api.conversations.createDraftForUpload);
    const activateDraftConversation = useMutation(api.conversations.activateDraft);
    const markDraftUploadFailed = useMutation(api.conversations.markUploadFailed);
    const removeConversation = useMutation(api.conversations.remove);
    const [isCreating, setIsCreating] = useState(false);
    const [deletingId, setDeletingId] = useState<Id<'conversations'> | null>(null);
    const handoffProcessedRef = useRef(false);
    const creatingRef = useRef(false);
    const draftConversationIdRef = useRef<Id<'conversations'> | null>(null);
    const isHistoryOpen = searchParams.get('history') === '1';

    const setHistoryOpen = useCallback((open: boolean) => {
        const params = new URLSearchParams(searchParams.toString());
        if (open) {
            params.set('history', '1');
        } else {
            params.delete('history');
        }
        const query = params.toString();
        router.replace(query ? `/chat?${query}` : '/chat', { scroll: false });
    }, [router, searchParams]);

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

    const handleSendNewChat = async (
        message: string,
        fileState?: ChatComposerFileState,
        _mode?: unknown,
        uploadCallbacks?: ChatInputUploadCallbacks,
    ) => {
        if (!activeCaseId) {
            throw new Error('Workspace is still loading. Please try again in a moment.');
        }
        if (creatingRef.current) {
            throw new Error('A new chat is already opening. Please wait a moment.');
        }
        creatingRef.current = true;
        setIsCreating(true);
        let createdConversationId: Id<'conversations'> | null = null;
        try {
            const id = draftConversationIdRef.current ?? await createDraftConversation({
                    title: buildConversationTitle(message),
                    mode: 'general',
                    caseId: activeCaseId,
                });
            draftConversationIdRef.current = id;
            createdConversationId = id;

            let attachments: ChatAttachmentRef[] | undefined;
            if (fileState?.attachmentRef) {
                attachments = [fileState.attachmentRef];
            } else if (fileState?.file) {
                const upload = await uploadFileForConversation({
                    convex,
                    file: fileState.file,
                    conversationId: id,
                    caseId: activeCaseId,
                    intent: fileState.intent,
                    clientUploadKey: fileState.clientUploadKey,
                    existingSession: fileState,
                    onProgress: uploadCallbacks?.onProgress,
                    onStatus: uploadCallbacks?.onStatus,
                    onStorageReady: uploadCallbacks?.onStorageReady,
                });
                uploadCallbacks?.onComplete(upload);
                attachments = [upload.attachmentRef];
            }

            const requestId = `${String(id)}-${crypto.randomUUID()}`;
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: id,
                    message,
                    requestId,
                    clientTurnId: requestId,
                    attachments,
                    persistUserMessage: true,
                    mode: 'send',
                }),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(`Failed to accept chat turn: ${response.status} ${errorText}`);
            }
            const data = await response.json();
            if (!data.ok || !data.accepted) {
                throw new Error(data.error || 'Chat turn was not accepted');
            }

            await activateDraftConversation({ id });
            draftConversationIdRef.current = null;
            router.push(`/chat/${id}`);
        } catch (error) {
            console.error('Failed to start conversation:', error);
            if (createdConversationId) {
                try {
                    await markDraftUploadFailed({ id: createdConversationId });
                } catch (cleanupError) {
                    console.warn('[ChatList] Failed to mark draft conversation after upload failure:', cleanupError);
                }
            }
            throw error;
        } finally {
            creatingRef.current = false;
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
                <PageHeader
                    icon={ChatTeardropDots}
                    title="NEXXChat"
                    description="Secure guidance for the next right step."
                    rightElement={(
                        <button
                            type="button"
                            onClick={() => setHistoryOpen(true)}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[11px] font-bold uppercase tracking-widest text-white/65 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
                            aria-label="Open chat history"
                        >
                            <SidebarSimple size={16} />
                            <span className="hidden sm:inline">History</span>
                            <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-white/45">
                                {isLoadingConversations ? '...' : totalConversations}
                            </span>
                        </button>
                    )}
                />

                <main className="flex min-h-0 flex-1 pb-6 sm:pb-8">
                    <motion.section
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col"
                    >
                        <div className="min-h-8 flex-[1_1_0]" />
                        <div className="mx-auto flex w-full max-w-sm flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-7 text-center shadow-[0_8px_32px_rgba(0,0,0,0.20)]">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                                <span className="pb-1 font-serif text-xl font-bold text-white/70"><i>N</i></span>
                            </div>
                            <h2 className="mb-2 text-sm font-bold text-white/90">Secure Counsel Authorized</h2>
                            <p className="text-xs font-medium leading-relaxed text-white/40">
                                Start fresh here. Older conversations stay available in History.
                            </p>
                        </div>

                        <div className="mt-12 rounded-[1.35rem] border border-white/10 bg-white/[0.045] p-2 shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:mt-[7.5rem]">
                            <ChatInput
                                onSend={handleSendNewChat}
                                disabled={!isWorkspaceReady || isCreating}
                                placeholder={isCreating ? 'Opening a new conversation...' : 'Ask NEXX anything...'}
                            />
                        </div>
                        <div className="min-h-5 flex-[0.2_1_0]" />
                    </motion.section>
                </main>
            </div>

            <HistoryDrawer
                open={isHistoryOpen}
                onClose={() => setHistoryOpen(false)}
                isLoading={isLoadingConversations}
                activeConversations={activeConversations}
                archivedConversations={archivedConversations}
                deletingId={deletingId}
                onDelete={handleDelete}
            />
        </PageContainer>
    );
}

/** Build a compact conversation title from the user's first prompt. */
function buildConversationTitle(message: string) {
    const normalized = message.replace(/\s+/g, ' ').trim();
    if (!normalized) return 'New Chat';
    const withoutTrailingPunctuation = normalized.replace(/[.!?]+$/g, '');
    const words = withoutTrailingPunctuation.split(' ').slice(0, 8).join(' ');
    const compact = words.length > 64 ? `${words.slice(0, 61).trim()}...` : words;
    return compact.trim().length > 0 ? compact : 'New Chat';
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
