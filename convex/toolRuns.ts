import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Tool Runs — audit trail for tool executions.
 * Records every function tool call made during a chat response,
 * including the input sent to the tool and the output received.
 *
 * Ownership: callerUserId must own the conversation.
 */

export const create = mutation({
    args: {
        conversationId: v.id('conversations'),
        toolType: v.string(),
        inputJson: v.string(),
        outputJson: v.optional(v.string()),
        callerUserId: v.string(),
    },
    handler: async (ctx, args) => {
        // Verify conversation ownership
        const conversation = await ctx.db.get(args.conversationId);
        if (!conversation) throw new Error('Conversation not found');
        if (String(conversation.userId) !== args.callerUserId) {
            throw new Error('Unauthorized: caller does not own this conversation');
        }

        // 30-day retention TTL
        const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
        const createdAt = Date.now();

        // Basic PII redaction: mask SSN, phone, email patterns in payloads
        const redact = (json: string): string => {
            return json
                .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]')
                .replace(/\b\d{10}\b/g, '[PHONE_REDACTED]')
                .replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, '[EMAIL_REDACTED]');
        };

        return await ctx.db.insert('toolRuns', {
            conversationId: args.conversationId,
            toolType: args.toolType,
            inputJson: redact(args.inputJson),
            outputJson: args.outputJson ? redact(args.outputJson) : undefined,
            createdAt,
            expiresAt: createdAt + RETENTION_MS,
        });
    },
});

export const getByConversation = query({
    args: {
        conversationId: v.id('conversations'),
        callerUserId: v.string(),
    },
    handler: async (ctx, args) => {
        // Verify conversation ownership
        const conversation = await ctx.db.get(args.conversationId);
        if (!conversation || String(conversation.userId) !== args.callerUserId) {
            return [];
        }

        return await ctx.db
            .query('toolRuns')
            .withIndex('by_conversationId', (q) => q.eq('conversationId', args.conversationId))
            .order('desc')
            .collect();
    },
});
