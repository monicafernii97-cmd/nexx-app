/**
 * Exhibit Cover Draft Response Parser (Hardened)
 *
 * Parses JSON output from the AI response with strict validation:
 * - Rejects non-string values (no String() coercion of objects)
 * - Ensures summaryLines is an array of actual strings
 * - Caps at 4 lines
 * - Enforces minimum 2 lines (else signals parse failure)
 * - Enforces sentence formatting (ends with period)
 * - Never throws — returns empty result on failure
 */

/** Parsed and validated result from AI exhibit cover draft response. */
export interface ParsedExhibitDraft {
  label?: string;
  title?: string;
  summaryLines: string[];
}

/**
 * Parse and validate the AI response into a structured exhibit draft.
 *
 * @returns Parsed result. If summaryLines is empty, the caller should
 *          fall back to deterministic generation.
 */
export function parseExhibitCoverDraftResponse(raw: string): ParsedExhibitDraft {
  try {
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return { summaryLines: [] };
    }

    // Extract and validate summaryLines — reject non-string values
    const rawLines = Array.isArray(parsed.summaryLines) ? parsed.summaryLines : [];

    const cleaned = rawLines
      .filter((line: unknown): line is string => typeof line === 'string')
      .map((line: string) => line.trim())
      .filter(Boolean)
      // Enforce sentence formatting: must end with period
      .map((line: string) => (line.endsWith('.') ? line : `${line}.`))
      .slice(0, 4);

    // Enforce minimum 2 lines — else treat as parse failure
    if (cleaned.length < 2) {
      return { summaryLines: [] };
    }

    return {
      // Validate types — only accept actual strings, never coerce
      label: typeof parsed.label === 'string' ? parsed.label.trim() : undefined,
      title:
        typeof parsed.suggestedTitle === 'string'
          ? parsed.suggestedTitle.trim()
          : typeof parsed.title === 'string'
            ? parsed.title.trim()
            : undefined,
      summaryLines: cleaned,
    };
  } catch {
    return { summaryLines: [] };
  }
}
