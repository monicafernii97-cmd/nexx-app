import { NextRequest } from 'next/server';
import { getOpenAI } from '@/lib/openai';
import { buildSystemPrompt } from '@/lib/systemPrompt';

const MAX_MESSAGE_LENGTH = 10000;
const MAX_MESSAGES = 50;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            messages,
            conversationMode,
            userContext,
        }: {
            messages: { role: 'user' | 'assistant'; content: string }[];
            conversationMode?: string;
            userContext?: {
                userName?: string;
                state?: string;
                custodyType?: string;
                nexBehaviors?: string[];
            };
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

        // Build context-enriched system prompt
        const systemPrompt = buildSystemPrompt({
            ...userContext,
            conversationMode,
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
                'Transfer-Encoding': 'chunked',
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
