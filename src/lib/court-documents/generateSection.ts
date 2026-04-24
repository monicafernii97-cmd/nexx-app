/**
 * Section Generation — AI-Assisted Content Creation
 *
 * Wraps the existing documentDrafter for single-section generation.
 * Used when a user clicks "Generate" on an empty section.
 *
 * Rules:
 * - AI NEVER mutates state directly
 * - AI ALWAYS returns content → state layer decides update
 * - All responses include success flag + error fallback
 */

import { generateDraftContent } from '@/lib/nexx/documentDrafter';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface GenerateSectionInput {
  sectionId: string;
  heading: string;
  /** Document type for context (e.g., 'motion') */
  documentType: string;
  /** Any existing content from other sections for context */
  documentContext?: string;
  /** Court rules/jurisdiction info */
  courtRules?: Record<string, unknown>;
  /** Abort signal for timeout */
  signal?: AbortSignal;
}

export type GenerateSectionResult =
  | { success: true; content: string }
  | { success: false; error: string };

// ═══════════════════════════════════════════════════════════════
// Generator
// ═══════════════════════════════════════════════════════════════

/**
 * Generate content for a single section using AI.
 *
 * Delegates to the existing documentDrafter with a single-section scope.
 * Returns structured result — caller decides whether to apply.
 */
export async function generateSectionContent(
  input: GenerateSectionInput,
): Promise<GenerateSectionResult> {
  try {
    const drafted = await generateDraftContent({
      templateId: `section_${input.sectionId}_${Date.now()}`,
      templateName: `${input.heading} — ${input.documentType}`,
      sections: [input.sectionId],
      caseGraph: input.documentContext
        ? { context: input.documentContext, documentType: input.documentType }
        : undefined,
      courtRules: input.courtRules,
      signal: input.signal,
    });

    if (!drafted.length || !drafted[0]?.body?.trim()) {
      return {
        success: false,
        error: 'AI_GENERATION_EMPTY',
      };
    }

    // Combine body + numbered items if present
    let content = drafted[0].body;
    if (drafted[0].numberedItems?.length) {
      content += '\n\n' + drafted[0].numberedItems.join('\n');
    }

    return { success: true, content };
  } catch (err) {
    console.error('[generateSectionContent] Failed:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'AI_GENERATION_FAILED',
    };
  }
}
