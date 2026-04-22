/**
 * Exhibit Cover Draft Response Parser (Hardened)
 *
 * Parses JSON output from the AI response with strict validation:
 * - Ensures summaryLines is an array of non-empty strings
 * - Caps at 4 lines
 * - Enforces minimum 2 lines (else signals parse failure)
 * - Enforces sentence formatting (ends with period)
 * - Never throws — returns empty result on failure
 */

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

    // Extract and validate summaryLines
    const rawLines = Array.isArray(parsed.summaryLines) ? parsed.summaryLines : [];

    const cleaned = rawLines
      .map((line: unknown) => String(line || '').trim())
      .filter(Boolean)
      // Enforce sentence formatting: must end with period
      .map((line: string) => (line.endsWith('.') ? line : `${line}.`))
      .slice(0, 4);

    // Enforce minimum 2 lines — else treat as parse failure
    if (cleaned.length < 2) {
      return { summaryLines: [] };
    }

    return {
      label: parsed.label ? String(parsed.label).trim() : undefined,
      title: parsed.suggestedTitle
        ? String(parsed.suggestedTitle).trim()
        : parsed.title
          ? String(parsed.title).trim()
          : undefined,
      summaryLines: cleaned,
    };
  } catch {
    return { summaryLines: [] };
  }
}
