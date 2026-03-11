import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOpenAI } from '@/lib/openai';
import { buildSystemPrompt } from '@/lib/systemPrompt';
import type { UserContext, LegalSearchResult } from '@/lib/types';
import { detectLegalTopic, extractLegalQuery, searchStatutes } from '@/lib/legal/search';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

const MAX_MESSAGE_LENGTH = 10000;
const MAX_MESSAGES = 50;

export async function POST(req: NextRequest) {
    // ── Auth guard ──
    const { userId } = await auth();
    if (!userId) {
        return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    // ── Rate limit (50/day free tier) ──
    const rl = checkRateLimit(userId, 'chat_message');
    if (!rl.allowed) {
        const { body, status } = rateLimitResponse(rl);
        return Response.json(body, { status });
    }

    try {
        const body = await req.json();
        const {
            messages,
            conversationMode,
            userContext,
        }: {
            messages: { role: 'user' | 'assistant'; content: string }[];
            conversationMode?: string;
            userContext?: UserContext;
        } = body;

        if (!messages || messages.length === 0) {
            return Response.json({ error: 'Messages are required' }, { status: 400 });
        }

        if (messages.length > MAX_MESSAGES) {
            return Response.json({ error: 'Too many messages' }, { status: 400 });
        }

        for (const msg of messages) {
            if (!msg.role || !['user', 'assistant'].includes(msg.role)) {
                return Response.json({ error: 'Invalid message role' }, { status: 400 });
            }
            if (typeof msg.content !== 'string' || msg.content.length > MAX_MESSAGE_LENGTH) {
                return Response.json({ error: 'Invalid message content' }, { status: 400 });
            }
        }

        // ── Legal statute search (server-side, before OpenAI) ──
        // Uses AbortController to cancel the request after 3s if Tavily is slow.
        // PRIVACY: Only extracted legal keywords are sent to Tavily, never raw user text.
        let legalContext: LegalSearchResult[] | undefined;
        // Find the last user message (backward loop — compatible with ES2017 target)
        let lastUserMessage: { role: 'user' | 'assistant'; content: string } | undefined;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                lastUserMessage = messages[i];
                break;
            }
        }

        if (lastUserMessage && detectLegalTopic(lastUserMessage.content) && userContext?.state) {
            const legalQuery = extractLegalQuery(lastUserMessage.content);

            if (legalQuery) {
                const LEGAL_SEARCH_TIMEOUT_MS = 3000;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    controller.abort();
                    console.warn('[chat] Tavily search timed out — proceeding without citations');
                }, LEGAL_SEARCH_TIMEOUT_MS);

                try {
                    const results = await searchStatutes(
                        userContext.state,
                        legalQuery,
                        userContext.county,
                        controller.signal
                    );
                    legalContext = results.length > 0 ? results : undefined;
                } catch (e) {
                    if (e instanceof Error && e.name !== 'AbortError') throw e;
                } finally {
                    clearTimeout(timeoutId);
                }
            }
        }

        // Build context-enriched system prompt (now with legal citations when available)
        const systemPrompt = buildSystemPrompt({
            ...userContext,
            conversationMode,
            legalContext,
        });

        // Stream response from OpenAI
        const stream = await getOpenAI().chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages,
            ],
            stream: true,
            temperature: 0.7,
            max_tokens: 2000,
        });

        // Create a ReadableStream for the response
        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content;
                        if (content) {
                            controller.enqueue(encoder.encode(content));
                        }
                    }
                    controller.close();
                } catch (error) {
                    controller.error(error);
                }
            },
        });

        return new Response(readableStream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-cache',
            },
        });
    } catch (error) {
        console.error('Chat API error:', error);
        return Response.json(
            { error: 'Failed to generate response' },
            { status: 500 }
        );
    }
}
