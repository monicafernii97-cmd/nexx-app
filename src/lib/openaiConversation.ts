/**
 * OpenAI Conversations API helper
 * 
 * This replaces the current `getOpenAI()` singleton for chat workflows.
 * Non-chat routes keep using the existing `getOpenAI()` from `openai.ts`.
 * 
 * Uses lazy initialization to avoid crashing during build/SSG
 * when OPENAI_API_KEY is not available.
 */

import OpenAI from 'openai';

let _openai: OpenAI | null = null;

/**
 * Get the shared OpenAI client instance (lazy-initialized).
 * Throws at runtime if OPENAI_API_KEY is missing, but NOT at build time.
 */
export function getOpenAIClient(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not configured.');
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

/** Convenience getter — same as getOpenAIClient() but matches existing import style. */
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    return (getOpenAIClient() as unknown as Record<string, unknown>)[prop as string];
  },
});

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
  const client = getOpenAIClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conversation = await (client as any).conversations.create();
  return conversation.id;
}
