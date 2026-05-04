import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOpenAIClient } from '@/lib/openaiConversation';

/**
 * Review Hub — AI Section Revision API
 * 
 * Accepts the original section text + a user instruction, and returns
 * a revised version via streaming. Uses GPT-4.1 for fast, focused
 * legal text revision without the full NEXX chat pipeline overhead.
 */
export const maxDuration = 60;

/**
 * POST /api/review/revise — Streaming AI section revision endpoint.
 *
 * Accepts original section text + a user instruction, streams back a revised
 * version via SSE using GPT-4.1. Supports multi-turn conversation history
 * for iterative refinement. Enforces size limits on all inputs.
 */
export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
        const parsed = await req.json();
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return Response.json({ error: 'Request body must be a JSON object' }, { status: 400 });
        }
        body = parsed as Record<string, unknown>;
    } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const {
        originalText,
        instruction,
        sectionName,
        conversationHistory,
    } = body as {
        originalText?: string;
        instruction?: string;
        sectionName?: string;
        conversationHistory?: { role: string; content: string }[];
    };

    const MAX_ORIGINAL_TEXT_CHARS = 50_000;
    const MAX_INSTRUCTION_CHARS = 4_000;
    const MAX_HISTORY_MESSAGES = 20;

    if (typeof originalText !== 'string' || originalText.trim().length === 0) {
        return Response.json({ error: 'originalText is required' }, { status: 400 });
    }
    if (typeof instruction !== 'string' || instruction.trim().length === 0) {
        return Response.json({ error: 'instruction is required' }, { status: 400 });
    }
    if (originalText.length > MAX_ORIGINAL_TEXT_CHARS) {
        return Response.json({ error: 'originalText is too large' }, { status: 413 });
    }
    if (instruction.length > MAX_INSTRUCTION_CHARS) {
        return Response.json({ error: 'instruction is too large' }, { status: 413 });
    }
    if (conversationHistory && conversationHistory.length > MAX_HISTORY_MESSAGES) {
        return Response.json({ error: 'conversationHistory is too large' }, { status: 413 });
    }

    try {
        const openai = getOpenAIClient();

        // Build the conversation messages for a focused revision task
        const systemPrompt = `You are a legal document revision assistant integrated into the NEXX platform's Review Hub.

Your job is to revise a specific section of a legal document based on the user's instruction.

Rules:
- Return ONLY the revised text. Do not include explanations, preambles, or commentary.
- Preserve legal formatting conventions (numbered paragraphs, indentation, citations).
- Maintain the same voice and tense as the original unless the user asks to change it.
- If the user asks to add a statute citation, use the correct format for Texas Family Code or whichever code is contextually relevant.
- Keep the text court-appropriate at all times. No emotional language unless the user specifically requests it.
- NEVER insert placeholder brackets like [FACT NEEDED], [Opposing Party], or [Child Name]. If information is missing, work around it or flag it naturally.
- Do NOT add section headings or titles unless explicitly asked.`;

        // Build messages array including any prior revision history
        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
            { role: 'system', content: systemPrompt },
        ];

        // Add conversation history if available (prior revisions in same session)
        if (conversationHistory && Array.isArray(conversationHistory)) {
            const MAX_ENTRY_CONTENT_CHARS = 10_000;
            for (const msg of conversationHistory) {
                if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
                    return Response.json({ error: 'Invalid conversationHistory entry' }, { status: 400 });
                }
                const { role, content } = msg as Record<string, unknown>;
                if (role !== 'user' && role !== 'assistant') {
                    return Response.json({ error: 'Invalid conversationHistory role' }, { status: 400 });
                }
                if (typeof content !== 'string' || content.trim().length === 0) {
                    return Response.json({ error: 'Invalid conversationHistory content' }, { status: 400 });
                }
                const normalized = content.trim();
                if (normalized.length > MAX_ENTRY_CONTENT_CHARS) {
                    return Response.json({ error: 'conversationHistory message is too large' }, { status: 413 });
                }
                messages.push({ role, content: normalized });
            }
        }

        // Add the current revision request
        const userPrompt = `Section: ${sectionName || 'Untitled Section'}

Original Text:
"""
${originalText}
"""

Instruction: ${instruction}

Please provide the revised text:`;

        messages.push({ role: 'user', content: userPrompt });

        // Stream the response
        const stream = await openai.chat.completions.create({
            model: 'gpt-4.1',
            messages,
            temperature: 0.3,
            max_tokens: 2048,
            stream: true,
        });

        const encoder = new TextEncoder();
        const readable = new ReadableStream({
            async start(controller) {
                try {
                    let fullText = '';
                    for await (const chunk of stream) {
                        const delta = chunk.choices?.[0]?.delta?.content ?? '';
                        if (delta) {
                            fullText += delta;
                            controller.enqueue(
                                encoder.encode(`data: ${JSON.stringify({ delta, fullText })}\n\n`)
                            );
                        }
                    }
                    // Send completion event
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ done: true, fullText })}\n\n`)
                    );
                    controller.close();
                } catch (err) {
                    console.error('[Review/Revise] Streaming error:', err);
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ error: 'Revision failed' })}\n\n`)
                    );
                    controller.close();
                }
            },
        });

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    } catch (err) {
        console.error('[Review/Revise] API error:', err);
        return Response.json({ error: 'Failed to revise section' }, { status: 500 });
    }
}
