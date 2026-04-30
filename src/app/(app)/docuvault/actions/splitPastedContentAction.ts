'use server';

/**
 * Server Action: Split Pasted Content
 *
 * Wraps splitPastedContent() as a Next.js server action so it can be
 * called from client components without importing the service directly.
 */

import { splitPastedContent, type SplitResult } from '@/lib/export-assembly/services/splitPastedContent';

/**
 * Split raw pasted content into structured review items (server-side).
 *
 * @param rawText - Raw text pasted by the user in DocuVault intake.
 * @returns Structured split result with review items and metadata.
 */
export async function splitPastedContentAction(rawText: string): Promise<SplitResult> {
    return splitPastedContent(rawText);
}
