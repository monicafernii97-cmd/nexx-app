/**
 * OpenAI Conversations API helper
 * 
 * This replaces the current `getOpenAI()` singleton for chat workflows.
 * Non-chat routes keep using the existing `getOpenAI()` from `openai.ts`.
 */

import OpenAI from 'openai';

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * Ensure an OpenAI conversation exists.
 * If an existing conversation ID is provided, return it as-is.
 * Otherwise, create a new durable conversation via the Conversations API.
 */
export async function ensureOpenAIConversation(
  existingConversationId?: string
): Promise<string> {
  if (existingConversationId) return existingConversationId;

  // Create a new durable conversation via the Conversations API
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conversation = await (openai as any).conversations.create();
  return conversation.id;
}
