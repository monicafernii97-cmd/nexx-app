import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { classifyMessage } from '@/lib/nexx/router';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { getDailyLimit, getModelForRoute, type SubscriptionTier } from '@/lib/tiers';

const MAX_MESSAGE_LENGTH = 100_000;

/**
 * Reliability-first chat admission route.
 *
 * This route only accepts and persists a chat turn, then lets Convex worker
 * actions perform provider generation. The browser no longer owns generation,
 * so disconnects, tab closes, and lost SSE final events cannot kill an
 * accepted chat turn.
 */
export const maxDuration = 30;

function buildConversationTitle(message: string) {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'New Chat';
  const withoutTrailingPunctuation = normalized.replace(/[.!?]+$/g, '');
  const words = withoutTrailingPunctuation.split(' ').slice(0, 8).join(' ');
  const compact = words.length > 64 ? `${words.slice(0, 61).trim()}...` : words;
  return compact.trim().length > 0 ? compact : 'New Chat';
}

function isPlaceholderTitle(title: string | undefined) {
  const currentTitle = (title ?? '').trim();
  return currentTitle.length === 0 || currentTitle === 'New Conversation' || currentTitle === 'New Chat';
}

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
    persistUserMessage,
    mode,
    retryOfAssistantMessageId,
    editOfUserMessageId,
  } = body as {
    message?: string;
    conversationId?: string;
    userContext?: Record<string, unknown>;
    requestId?: string;
    persistUserMessage?: boolean;
    mode?: 'send' | 'retry' | 'edit';
    retryOfAssistantMessageId?: string;
    editOfUserMessageId?: string;
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

  const validTiers: SubscriptionTier[] = ['free', 'pro', 'premium', 'executive'];
  const userTier: SubscriptionTier =
    userRecord.subscriptionTier && validTiers.includes(userRecord.subscriptionTier as SubscriptionTier)
      ? (userRecord.subscriptionTier as SubscriptionTier)
      : 'free';

  const routerResult = classifyMessage(message);
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

  if (dailyCap !== -1) {
    const rateLimit = await convex.mutation(api.chatRateLimits.consume, {
      key: model.includes('pro') ? 'chat_message_5_4_pro' : 'chat_message_5_4',
      limit: dailyCap,
    });
    if (!rateLimit.allowed) {
      return Response.json(
        { error: 'Daily message limit reached. Please upgrade your plan or try again tomorrow.' },
        { status: 429 }
      );
    }
  }

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
      persistUserMessage: persistUserMessage !== false,
      retryOfAssistantMessageId: retryOfAssistantMessageId
        ? (retryOfAssistantMessageId as Id<'messages'>)
        : undefined,
      editOfUserMessageId: editOfUserMessageId ? (editOfUserMessageId as Id<'messages'>) : undefined,
    });

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
