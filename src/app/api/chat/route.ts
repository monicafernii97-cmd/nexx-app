import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { classifyMessage } from '@/lib/nexx/router';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { getDailyLimit, getModelForRoute, type SubscriptionTier } from '@/lib/tiers';

const MAX_MESSAGE_LENGTH = 100_000;

type ChatAttachmentRef = {
  uploadedFileId: string;
  uploadSessionId: string;
  storageId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  status: 'ready' | 'partial';
};

/**
 * Reliability-first chat admission route.
 *
 * This route only accepts and persists a chat turn, then lets Convex worker
 * actions perform provider generation. The browser no longer owns generation,
 * so disconnects, tab closes, and lost SSE final events cannot kill an
 * accepted chat turn.
 */
export const maxDuration = 30;

/** Build a short default title from the first accepted user message. */
function buildConversationTitle(message: string) {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'New Chat';
  const withoutTrailingPunctuation = normalized.replace(/[.!?]+$/g, '');
  const words = withoutTrailingPunctuation.split(' ').slice(0, 8).join(' ');
  const compact = words.length > 64 ? `${words.slice(0, 61).trim()}...` : words;
  return compact.trim().length > 0 ? compact : 'New Chat';
}

/** Return true when a conversation title can be replaced by first-message text. */
function isPlaceholderTitle(title: string | undefined) {
  const currentTitle = (title ?? '').trim();
  return currentTitle.length === 0 || currentTitle === 'New Conversation' || currentTitle === 'New Chat';
}

/** Accept a chat turn and enqueue provider generation in Convex. */
export async function POST(req: NextRequest) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    message,
    conversationId,
    userContext,
    requestId,
    clientTurnId,
    persistUserMessage,
    mode,
    retryOfAssistantMessageId,
    editOfUserMessageId,
    attachments,
  } = body as {
    message?: string;
    conversationId?: string;
    userContext?: Record<string, unknown>;
    requestId?: string;
    clientTurnId?: string;
    persistUserMessage?: boolean;
    mode?: 'send' | 'retry' | 'edit';
    retryOfAssistantMessageId?: string;
    editOfUserMessageId?: string;
    attachments?: ChatAttachmentRef[];
  };

  if (
    typeof message !== 'string' ||
    message.trim().length === 0 ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return Response.json({ error: 'Invalid message' }, { status: 400 });
  }

  if (typeof conversationId !== 'string' || conversationId.trim().length === 0) {
    return Response.json({ error: 'conversationId is required' }, { status: 400 });
  }

  const turnRequestId =
    typeof requestId === 'string' && requestId.trim().length > 0
      ? requestId
      : typeof clientTurnId === 'string' && clientTurnId.trim().length > 0
      ? clientTurnId
      : crypto.randomUUID();

  const convex = await getAuthenticatedConvexClient();
  const typedConversationId = conversationId as Id<'conversations'>;

  let userRecord;
  try {
    userRecord = await convex.query(api.users.getByClerkId, { clerkId: clerkUserId });
  } catch (error) {
    console.warn('[Chat] Failed to fetch user record:', error);
    return Response.json({ error: 'Failed to resolve user context' }, { status: 500 });
  }

  if (!userRecord) {
    return Response.json({ error: 'User not found' }, { status: 403 });
  }

  let conversation;
  try {
    conversation = await convex.query(api.conversations.get, { id: typedConversationId });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('Not authorized') || errorMsg.includes('Not authenticated')) {
      return Response.json({ error: 'Unauthorized access to conversation' }, { status: 403 });
    }
    return Response.json({ error: 'Conversation not found or inaccessible' }, { status: 404 });
  }

  let sanitizedAttachments: ChatAttachmentRef[] = [];
  if (attachments !== undefined) {
    if (!Array.isArray(attachments) || attachments.length > 5) {
      return Response.json({ error: 'Invalid attachments' }, { status: 400 });
    }
    try {
      sanitizedAttachments = await convex.query(api.chatUploads.validateAttachmentsForChat, {
        conversationId: typedConversationId,
        attachments: attachments.map((attachment) => ({
          uploadedFileId: attachment.uploadedFileId as Id<'uploadedFiles'>,
          uploadSessionId: attachment.uploadSessionId as Id<'chatUploadSessions'>,
          storageId: attachment.storageId as Id<'_storage'>,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          byteSize: attachment.byteSize,
          status: attachment.status,
        })),
      }) as ChatAttachmentRef[];
    } catch (error) {
      console.warn('[Chat] Attachment validation failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isClientAttachmentError =
        errorMessage.includes('Attachment') ||
        errorMessage.includes('attachments') ||
        errorMessage.includes('not ready') ||
        errorMessage.includes('does not belong') ||
        errorMessage.includes('Too many');
      return Response.json(
        {
          error: isClientAttachmentError
            ? 'One or more attachments are not ready for chat.'
            : 'Unable to validate chat attachments. Please try again.',
        },
        { status: isClientAttachmentError ? 400 : 500 },
      );
    }
  }

  const validTiers: SubscriptionTier[] = ['free', 'pro', 'premium', 'executive'];
  const userTier: SubscriptionTier =
    userRecord.subscriptionTier && validTiers.includes(userRecord.subscriptionTier as SubscriptionTier)
      ? (userRecord.subscriptionTier as SubscriptionTier)
      : 'free';

  const routerResult = sanitizedAttachments.length > 0
    ? { ...classifyMessage(message), mode: 'document_analysis' as const }
    : classifyMessage(message);
  console.info('[Chat] Accepting chat turn', {
    requestId: turnRequestId,
    conversationIdPresent: Boolean(conversationId),
    messageLength: message.length,
    attachmentCount: sanitizedAttachments.length,
    attachmentStatuses: sanitizedAttachments.map((attachment) => attachment.status),
    routeMode: routerResult.mode,
  });
  const routeModeToFeature: Record<
    string,
    'chat' | 'analysis' | 'judge_sim' | 'opposition_sim' | 'deep_draft' | 'memory' | 'confidence'
  > = {
    adaptive_chat: 'chat',
    direct_legal_answer: 'chat',
    local_procedure: 'chat',
    document_analysis: 'analysis',
    judge_lens_strategy: 'judge_sim',
    court_ready_drafting: 'deep_draft',
    pattern_analysis: 'analysis',
    support_grounding: 'chat',
    safety_escalation: 'chat',
  };
  const modelFeature = routeModeToFeature[routerResult.mode] ?? 'chat';
  const model = getModelForRoute(userTier, modelFeature);
  const dailyCap = getDailyLimit(userTier, model);

  const rateLimitKey = model.includes('pro') ? 'chat_message_5_4_pro' : 'chat_message_5_4';

  try {
    const accepted = await convex.mutation(api.chatTurns.acceptChatTurn, {
      conversationId: typedConversationId,
      requestId: turnRequestId,
      message,
      mode: mode ?? (persistUserMessage === false ? 'retry' : 'send'),
      routeMode: routerResult.mode,
      model,
      temperature: routerResult.temperature,
      userContextJson: userContext ? JSON.stringify(userContext) : undefined,
      attachments: sanitizedAttachments.map((attachment) => ({
        uploadedFileId: attachment.uploadedFileId as Id<'uploadedFiles'>,
        uploadSessionId: attachment.uploadSessionId as Id<'chatUploadSessions'>,
        storageId: attachment.storageId as Id<'_storage'>,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        byteSize: attachment.byteSize,
        status: attachment.status,
      })),
      persistUserMessage: persistUserMessage !== false,
      rateLimitKey,
      rateLimit: dailyCap,
      retryOfAssistantMessageId: retryOfAssistantMessageId
        ? (retryOfAssistantMessageId as Id<'messages'>)
        : undefined,
      editOfUserMessageId: editOfUserMessageId ? (editOfUserMessageId as Id<'messages'>) : undefined,
    });

    if (!accepted.accepted && 'rateLimited' in accepted && accepted.rateLimited) {
      return Response.json(
        { error: 'Daily message limit reached. Please upgrade your plan or try again tomorrow.' },
        { status: 429 }
      );
    }

    if (!accepted.duplicate && persistUserMessage !== false && isPlaceholderTitle(conversation.title)) {
      try {
        await convex.mutation(api.conversations.updateTitle, {
          id: typedConversationId,
          title: buildConversationTitle(message),
        });
      } catch (titleError) {
        console.warn('[Chat] Failed to update conversation title:', titleError);
      }
    }

    return Response.json(
      {
        ok: true,
        accepted: true,
        transport: 'realtime-db',
        requestId: turnRequestId,
        turn: accepted,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('[Chat] Failed to accept chat turn:', error);
    return Response.json(
      { error: 'Unable to accept chat turn. Please try again.' },
      { status: 503 }
    );
  }
}
