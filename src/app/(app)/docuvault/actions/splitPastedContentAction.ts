'use server';

/**
 * Server Action: Split Pasted Content
 *
 * Wraps splitPastedContent() as a Next.js server action so it can be
 * called from client components without importing the service directly.
 *
 * Returns only the fields needed by ExportContext (items, strategy, meta)
 * to avoid serializing the bulky parsedDocument over the wire.
 */

import { splitPastedContent } from '@/lib/export-assembly/services/splitPastedContent';
import type { SplitResult } from '@/lib/export-assembly/services/splitPastedContent';

/** Narrowed result containing only the fields ExportContext needs. */
export type SplitActionResult = Pick<SplitResult, 'items' | 'strategy' | 'meta'>;

/**
 * Split raw pasted content into structured review items (server-side).
 *
 * @param rawText - Raw text pasted by the user in DocuVault intake.
 * @returns Narrowed split result with items, strategy, and metadata.
 */
export async function splitPastedContentAction(rawText: string): Promise<SplitActionResult> {
    const result = splitPastedContent(rawText);
    return {
        items: result.items,
        strategy: result.strategy,
        meta: result.meta,
    };
}
