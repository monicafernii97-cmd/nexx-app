/**
 * Section Rewrite — AI Court-Ready Polishing
 *
 * Takes existing section content + optional feedback note and
 * produces a court-ready rewrite. Uses a focused system prompt
 * that preserves legal meaning while improving quality.
 *
 * Rules:
 * - AI NEVER mutates state directly
 * - Never removes legal meaning from the original
 * - All responses include success flag + error fallback
 */

import { openai } from '@/lib/openaiConversation';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface RewriteSectionInput {
  /** Current content to rewrite */
  content: string;
  /** User's feedback/instructions for the rewrite */
  feedbackNote?: string;
  /** Section heading for context */
  heading: string;
  /** Document type for tone calibration */
  documentType: string;
  /** Abort signal for timeout */
  signal?: AbortSignal;
}

export type RewriteSectionResult =
  | { success: true; rewrittenContent: string }
  | { success: false; error: string };

// ═══════════════════════════════════════════════════════════════
// Rewriter
// ═══════════════════════════════════════════════════════════════

const REWRITE_SYSTEM_PROMPT = `You are a legal document editor. Your role is to rewrite a document section to be court-ready.

Rules:
- Preserve ALL legal meaning from the original text
- Use formal legal language appropriate for court filings
- Fix grammatical and stylistic issues
- Ensure proper paragraph structure
- Never fabricate facts — only polish what exists
- Never add legal arguments not present in the original
- Output ONLY the rewritten section content — no commentary, no explanations

If the user provides feedback instructions, follow them while maintaining legal quality.`;

/**
 * Rewrite a section's content to court-ready quality.
 *
 * Returns structured result — caller decides whether to apply.
 */
export async function rewriteToCourtReady(
  input: RewriteSectionInput,
): Promise<RewriteSectionResult> {
  const { content, feedbackNote, heading, documentType, signal } = input;

  if (!content.trim()) {
    return { success: false, error: 'EMPTY_CONTENT' };
  }

  const userMessage = [
    `Section: ${heading}`,
    `Document Type: ${documentType}`,
    feedbackNote ? `\nUser Instructions: ${feedbackNote}` : '',
    `\n--- ORIGINAL CONTENT ---\n${content}\n--- END ---`,
    `\nRewrite this section to be court-ready.`,
  ].join('\n');

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (openai.responses as any).create(
      {
        model: 'gpt-5.4',
        input: [
          { role: 'developer', content: REWRITE_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      },
      signal ? { signal } : undefined,
    );

    const rewritten = response.output_text?.trim();

    if (!rewritten) {
      return { success: false, error: 'AI_REWRITE_EMPTY' };
    }

    return { success: true, rewrittenContent: rewritten };
  } catch (err) {
    // Rethrow aborts so the route can map them to 504
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    console.error('[rewriteToCourtReady] Failed:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'AI_REWRITE_FAILED',
    };
  }
}
