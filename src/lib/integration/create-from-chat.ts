/**
 * Create From Chat — Creates items in Convex from chat panel context.
 *
 * Wraps Convex mutations with source metadata (conversationId, messageId,
 * panelType) so every created item is traceable to its origin.
 */

import type { ConvexReactClient } from 'convex/react';
import type { ItemSource, ActionResult } from './types';
import type { ConvertTarget } from './route-created-item';
import { getConvertRoute, buildConvertResult } from './route-created-item';
import type { Id } from '@convex/_generated/dataModel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateFromChatArgs {
    /** The text content to convert */
    content: string;
    /** A title for the new item (derived from panel title or first line) */
    title: string;
    /** What to convert it into */
    target: ConvertTarget;
    /** Source traceability */
    source: ItemSource;
    /** The active case ID */
    caseId?: Id<'cases'>;
}

// ---------------------------------------------------------------------------
// Title extraction helper
// ---------------------------------------------------------------------------

/**
 * Extract a reasonable title from content if none provided.
 * Uses the first sentence or first 60 characters.
 */
export function extractTitle(content: string, fallback = 'Untitled'): string {
    if (!content.trim()) return fallback;
    // Try first sentence
    const firstSentence = content.split(/[.!?]\s/)[0];
    if (firstSentence && firstSentence.length <= 80) {
        return firstSentence.replace(/[.!?]$/, '').trim();
    }
    // Truncate to 60 chars
    return content.slice(0, 60).trim() + (content.length > 60 ? '…' : '');
}

// ---------------------------------------------------------------------------
// Create item (pure function — actual Convex call happens in WorkspaceClient)
// ---------------------------------------------------------------------------

/**
 * Build the mutation arguments for creating an item from chat.
 * Returns the save type and formatted args ready for Convex.
 */
export function buildCreateArgs(args: CreateFromChatArgs) {
    const route = getConvertRoute(args.target);
    const title = args.title || extractTitle(args.content);

    const baseArgs = {
        title,
        content: args.content,
        type: route.saveType,
        sourceConversationId: args.source.conversationId,
        sourceMessageId: args.source.messageId,
        caseId: args.caseId,
    };

    // Timeline candidates need special fields
    if (args.target === 'timeline_item') {
        return {
            mutation: 'timelineCandidates' as const,
            args: {
                title,
                description: args.content,
                tags: [],
                caseId: args.caseId,
            },
        };
    }

    // Everything else goes to caseMemory
    return {
        mutation: 'caseMemory' as const,
        args: baseArgs,
    };
}

/**
 * Build the success result for a create-from-chat action.
 */
export function buildCreateResult(args: CreateFromChatArgs): ActionResult {
    return buildConvertResult(args.target, args.source);
}
