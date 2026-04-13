/**
 * Workspace API Utilities — shared helpers for workspace route handlers.
 *
 * Extracted here to avoid duplication across patterns, narrative,
 * and report routes.
 */

import { createHash } from 'crypto';

/**
 * Derive a stable idempotency key from case context.
 * Same caseId + type + calendar day → same key, so retries within a day dedupe.
 */
export function stableRequestId(caseId: string, type: string): string {
    const dayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return createHash('sha256').update(`${caseId}:${type}:${dayKey}`).digest('hex').slice(0, 32);
}

/** Serialize an array of Convex documents into a readable string for the prompt. */
export function serializeForPrompt(items: unknown[], label: string): string {
    if (!items || items.length === 0) return `No ${label} documented.`;
    return JSON.stringify(items, null, 2);
}
