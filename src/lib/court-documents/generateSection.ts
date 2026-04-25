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

    // Find the section matching the requested sectionId (not just [0])
    const section = drafted.find(s => s.sectionId === input.sectionId) ?? drafted[0];
    const hasBody = Boolean(section?.body?.trim());
    const hasItems = Boolean(section?.numberedItems?.some((item: string) => item.trim()));
    if (!section || (!hasBody && !hasItems)) {
      return {
        success: false,
        error: 'AI_GENERATION_EMPTY',
      };
    }

    // Verify the AI actually returned content for the requested section
    if (section.sectionId !== input.sectionId) {
      console.warn(
        `[generateSectionContent] AI returned section "${section.sectionId}" but "${input.sectionId}" was requested`,
      );
      return {
        success: false,
        error: 'AI_GENERATION_WRONG_SECTION',
      };
    }

    // Combine body + numbered items if present
    let content = section.body?.trim() ?? '';
    if (hasItems) {
      content += `${content ? '\n\n' : ''}${section.numberedItems!.join('\n')}`;
    }

    return { success: true, content };
  } catch (err) {
    // Rethrow aborts so the route can map them to 504
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    console.error('[generateSectionContent] Failed:', err instanceof Error ? err.name : 'unknown');
    return {
      success: false,
      error: 'AI_GENERATION_FAILED',
    };
  }
}
