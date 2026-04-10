import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUserAndConversation } from './lib/auth';

/**
 * Tool Runs — audit trail for tool executions.
 * Records every function tool call made during a chat response,
 * including the input sent to the tool and the output received.
 *
 * Auth: server-derived via ctx.auth (Clerk JWT). Not caller-supplied.
 * Retention: 30-day TTL enforced on read + periodic cleanup.
 */

export const create = mutation({
    args: {
        conversationId: v.id('conversations'),
        toolType: v.string(),
        inputJson: v.string(),
        outputJson: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Server-derived auth
        await getAuthenticatedUserAndConversation(ctx, args.conversationId);

        // 30-day retention TTL
        const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
        const createdAt = Date.now();

        // PII redaction: mask known PII patterns in payloads before persistence
        const redact = (json: string): string => {
            return json
                // SSN: 123-45-6789
                .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]')
                // Phone: 10-digit bare, formatted (xxx) xxx-xxxx, xxx-xxx-xxxx
                .replace(/\b\d{10}\b/g, '[PHONE_REDACTED]')
                .replace(/\(\d{3}\)\s*\d{3}[-.]?\d{4}/g, '[PHONE_REDACTED]')
                .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]')
                // Email
                .replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, '[EMAIL_REDACTED]')
                // Date of birth patterns: DOB: mm/dd/yyyy, born mm/dd/yyyy
                .replace(/\b(?:DOB|born|d\.o\.b\.?)\s*:?\s*\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\b/gi, '[DOB_REDACTED]')
                // US street addresses (rough pattern)
                .replace(/\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:St(?:reet)?|Ave(?:nue)?|Blvd|Dr(?:ive)?|Ln|Rd|Ct|Way|Pl)\b\.?/gi, '[ADDRESS_REDACTED]');
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
    },
    handler: async (ctx, args) => {
        // Server-derived auth
        await getAuthenticatedUserAndConversation(ctx, args.conversationId);

        const now = Date.now();
        const allRuns = await ctx.db
            .query('toolRuns')
            .withIndex('by_conversationId', (q) => q.eq('conversationId', args.conversationId))
            .order('desc')
            .collect();

        // Filter out expired rows on read
        return allRuns.filter((run) => !run.expiresAt || run.expiresAt > now);
    },
});

/**
 * Scheduled cleanup — delete expired tool runs.
 * Call via cron or internal action every 24h.
 */
export const deleteExpired = internalMutation({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();
        const expired = await ctx.db
            .query('toolRuns')
            .filter((q) => q.lt(q.field('expiresAt'), now))
            .take(500); // batch to avoid timeout

        for (const run of expired) {
            await ctx.db.delete(run._id);
        }

        return { deleted: expired.length };
    },
});
