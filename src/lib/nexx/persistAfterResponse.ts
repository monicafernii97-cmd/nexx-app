/**
 * persistAfterResponse — async post-response processing.
 * 
 * Called after the chat response is sent to the user.
 * Handles memory compaction and case graph updates without blocking the response.
 */

import { shouldCompact, summarizeConversation, updateCaseGraph } from './memory';
import { mergeCaseGraph } from './caseGraphUpdater';
import type { CaseGraph } from './caseGraph';
import type { ConversationSummary } from '../types';

interface PersistContext {
  conversationId: string;
  messages: Array<{ role: string; content: string }>;
  messageCount: number;
  existingSummary?: ConversationSummary;
  existingCaseGraph?: CaseGraph;
  /** Callback to save summary to Convex */
  saveSummary: (summary: ConversationSummary, turnCount: number) => Promise<void>;
  /** Callback to save case graph to Convex */
  saveCaseGraph: (graphJson: string) => Promise<void>;
}

/**
 * Run post-response tasks. Fire-and-forget from the route handler.
 * Errors are logged but do not affect the user-facing response.
 */
export async function persistAfterResponse(ctx: PersistContext): Promise<void> {
  try {
    const tasks: Promise<void>[] = [];

    // Memory compaction: every 6 turns
    if (shouldCompact(ctx.messageCount)) {
      tasks.push(compactMemory(ctx));
    }

    // Case graph update: check every response for new intelligence
    tasks.push(updateGraph(ctx));

    await Promise.allSettled(tasks);
  } catch (error) {
    // Log but don't throw — this is fire-and-forget
    console.error('[persistAfterResponse] Error:', error);
  }
}

async function compactMemory(ctx: PersistContext): Promise<void> {
  // Take last 12 messages for summarization (6 user + 6 assistant turns)
  const recentMessages = ctx.messages.slice(-12);

  const summary = await summarizeConversation({
    messages: recentMessages,
    existingSummary: ctx.existingSummary,
  });

  await ctx.saveSummary(summary, ctx.messageCount);
}

async function updateGraph(ctx: PersistContext): Promise<void> {
  // Only check last 2 messages (the user message + assistant response)
  const recentMessages = ctx.messages.slice(-2);
  if (recentMessages.length === 0) return;

  const updates = await updateCaseGraph({
    messages: recentMessages,
    existingGraph: ctx.existingCaseGraph,
  });

  // Only save if there are actual updates
  if (Object.keys(updates).length > 0) {
    const merged = mergeCaseGraph(ctx.existingCaseGraph, updates);
    await ctx.saveCaseGraph(JSON.stringify(merged));
  }
}
