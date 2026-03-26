import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOpenAI } from '@/lib/openai';
import { buildSystemPrompt } from '@/lib/systemPrompt';
import type { UserContext, LegalSearchResult } from '@/lib/types';
import { detectLegalTopic, extractLegalQuery, searchStatutes } from '@/lib/legal/search';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { getModelForMode, isPremiumModel, getDailyLimit, type SubscriptionTier } from '@/lib/tiers';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '../../../../convex/_generated/api';

const MAX_MESSAGE_LENGTH = 10000;
const MAX_MESSAGES = 50;

/** Handle POST requests for AI chat — authenticates user, rate-limits, and streams GPT responses. */
export async function POST(req: NextRequest) {
    // ── Auth guard ──
    const { userId } = await auth();
    if (!userId) {
        return Response.json({ error: 'Authentication required' }, { status: 401 });
    }


    try {
        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return Response.json({ error: 'Invalid request body' }, { status: 400 });
        }
        const {
            messages,
            userContext,
        } = body as {
            messages: { role: 'user' | 'assistant'; content: string }[];
            userContext?: UserContext;
        };

        // All conversations use the premium model for maximum quality
        const model = getModelForMode();
        const premium = isPremiumModel(model);

        // ── Fetch user tier from Convex ──
        const validTiers: SubscriptionTier[] = ['free', 'pro', 'premium', 'executive'];
        let userTier: SubscriptionTier = 'free';
        let tierResolved = false; // true = tier came from DB; false = lookup failed
        try {
            const convex = await getAuthenticatedConvexClient();
            const userRecord = await convex.query(api.users.getByClerkId, { clerkId: userId });
            if (userRecord?.subscriptionTier && validTiers.includes(userRecord.subscriptionTier as SubscriptionTier)) {
                userTier = userRecord.subscriptionTier as SubscriptionTier;
            }
            tierResolved = true;
        } catch (err) {
            console.warn('[Chat] Failed to fetch user tier from Convex — skipping rate limit for this request:', err);
        }

        // ── Validate input before consuming rate limit ──
        if (!Array.isArray(messages) || messages.length === 0) {
            return Response.json({ error: 'Messages are required' }, { status: 400 });
        }

        if (messages.length > MAX_MESSAGES) {
            return Response.json({ error: 'Too many messages' }, { status: 400 });
        }

        for (const msg of messages as unknown[]) {
            if (!msg || typeof msg !== 'object') {
                return Response.json({ error: 'Invalid message payload' }, { status: 400 });
            }

            const { role, content } = msg as { role?: unknown; content?: unknown };
            if (role !== 'user' && role !== 'assistant') {
                return Response.json({ error: 'Invalid message role' }, { status: 400 });
            }
            if (typeof content !== 'string' || content.length > MAX_MESSAGE_LENGTH) {
                return Response.json({ error: 'Invalid message content' }, { status: 400 });
            }
        }

        // ── Tier-specific rate limit for the chosen model ──
        // Only enforce when the tier was successfully resolved from the DB.
        // If the lookup failed, we skip rate limiting to avoid penalizing paid
        // users with free-tier limits during transient outages.
        if (tierResolved) {
            const feature = premium ? 'chat_message_4o' as const : 'chat_message_mini' as const;
            const dailyCap = getDailyLimit(userTier, model);

            if (dailyCap !== -1) { // -1 = unlimited
                const tierRl = checkRateLimit(userId, feature, dailyCap);
                if (!tierRl.allowed) {
                    const { body: rlBody, status } = rateLimitResponse(tierRl, userTier);
                    return Response.json(rlBody, { status });
                }
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
            legalContext,
        });

        // Stream response from OpenAI (model determined by conversation mode + tier)
        const stream = await getOpenAI().chat.completions.create({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages,
            ],
            stream: true,
            temperature: 0.7,
            max_tokens: 4096,
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
