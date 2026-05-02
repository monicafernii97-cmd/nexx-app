/**
 * Legal Document Input Normalizer
 *
 * Cleans and normalizes pasted/imported legal content before parsing.
 * Handles smart quotes, decorative separators, tabs, extra blank lines,
 * invisible Unicode, and hard-wrapped paragraphs.
 *
 * This is step 1 of the unified pipeline:
 *   normalizeLegalInput() → classifyLegalDocument() → parseLegalDocumentStructure() → ...
 */

// ═══════════════════════════════════════════════════════════════
// Output Type
// ═══════════════════════════════════════════════════════════════

export type NormalizedLegalInput = {
  /** Original unmodified input. */
  rawText: string;
  /** Cleaned text ready for parsing. */
  cleanedText: string;
  /** Lines split from cleaned text (non-empty, trimmed). */
  lines: string[];
  /** Separator patterns detected during normalization. */
  detectedSeparators: string[];
  /** Non-fatal issues found during normalization. */
  warnings: string[];
};

// ═══════════════════════════════════════════════════════════════
// Main Normalizer
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize raw legal text input for structured parsing.
 *
 * Does NOT interpret structure — only cleans encoding, whitespace,
 * and formatting artifacts from pasting/copying.
 */
export function normalizeLegalInput(input: string): NormalizedLegalInput {
  const warnings: string[] = [];
  const detectedSeparators: string[] = [];

  if (!input || !input.trim()) {
    return {
      rawText: input ?? '',
      cleanedText: '',
      lines: [],
      detectedSeparators: [],
      warnings: ['Input is empty.'],
    };
  }

  let text = input;

  // ── 1. Normalize line endings ─────────────────────────────
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // ── 2. Replace invisible Unicode whitespace ───────────────
  // Non-breaking space, zero-width space, thin space, etc.
  text = text.replace(/\u00A0/g, ' ');    // NBSP → space
  text = text.replace(/\u200B/g, '');     // zero-width space
  text = text.replace(/\u200C/g, '');     // zero-width non-joiner
  text = text.replace(/\u200D/g, '');     // zero-width joiner
  text = text.replace(/\uFEFF/g, '');     // BOM
  text = text.replace(/\u2009/g, ' ');    // thin space
  text = text.replace(/\u2003/g, ' ');    // em space
  text = text.replace(/\u2002/g, ' ');    // en space

  // ── 3. Normalize quotation marks ──────────────────────────
  text = text.replace(/[\u201C\u201D\u201E\u201F]/g, '"');  // smart double quotes
  text = text.replace(/[\u2018\u2019\u201A\u201B]/g, "'");  // smart single quotes

  // ── 4. Normalize dashes ───────────────────────────────────
  // Em dash → standard em dash (keep as-is for legal text)
  // But decorative separator lines (multiple dashes) → newline separator
  const separatorPattern = /^[\u2014\u2013\u2500\u2501─—–-]{3,}$/gm;
  const separatorMatches = text.match(separatorPattern);
  if (separatorMatches) {
    detectedSeparators.push(...separatorMatches);
  }
  text = text.replace(separatorPattern, '\n');

  // ⸻ (U+2E3B — three-em dash, common in pasted legal docs)
  text = text.replace(/⸻/g, '\n');

  // ── 5. Normalize tabs to spaces ───────────────────────────
  // Tabs in front of numbered items (common in pasted legal docs)
  text = text.replace(/\t/g, '  ');

  // ── 6. Remove trailing whitespace per line ────────────────
  text = text.replace(/[ \t]+$/gm, '');

  // ── 7. Collapse excessive blank lines (3+ → 2) ───────────
  text = text.replace(/\n{3,}/g, '\n\n');

  // ── 8. Trim leading/trailing whitespace ───────────────────
  text = text.trim();

  // ── 9. Detect potential issues ────────────────────────────
  if (text.length < 100) {
    warnings.push('Input is very short — may not contain a complete legal document.');
  }

  // Check for signs of copied table formatting
  if (/\t{2,}/.test(input)) {
    warnings.push('Multiple consecutive tabs detected — possible table-formatted input.');
  }

  // ── 10. Split into lines ──────────────────────────────────
  const lines = text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  return {
    rawText: input,
    cleanedText: text,
    lines,
    detectedSeparators,
    warnings,
  };
}
