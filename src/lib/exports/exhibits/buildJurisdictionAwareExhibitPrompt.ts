/**
 * Jurisdiction-Aware Exhibit Prompt Builder
 *
 * Builds structured system instructions + user input for
 * court-safe exhibit cover summary generation.
 *
 * Rules enforced in the prompt:
 * - Neutral, factual, court-safe language only
 * - No arguments, speculation, or emotional framing
 * - JSON-only output
 * - 2–4 summary lines
 */

import type { ExhibitCoverDraftInput } from './types';

// ═══════════════════════════════════════════════════════════════
// System Instructions (STRICT — locked for court safety)
// ═══════════════════════════════════════════════════════════════

const SYSTEM_INSTRUCTIONS = `
You are a legal document drafting assistant generating exhibit cover sheet summaries for court filings.

Your task is to produce concise, neutral, factual summary lines for exhibit cover pages.

STRICT RULES:
- Do NOT include opinions, arguments, or persuasive language
- Do NOT speculate or infer facts not explicitly provided
- Do NOT use emotional, exaggerated, or adversarial wording
- Use plain, professional, court-safe language
- Each summary line must be 1 sentence
- Each sentence must be clear, factual, and self-contained
- Maximum 4 summary lines
- Prefer 2–3 lines when sufficient
- Avoid redundancy across lines
- Do NOT include labels like "Summary:" or "Exhibit shows"
- Do NOT include legal conclusions
- Do NOT include party blame or intent

OUTPUT REQUIREMENTS:
- You MUST return valid JSON only
- No prose outside JSON
- No markdown
- No explanations

If the input is insufficient, generate safe, generic factual descriptions based only on provided fields.
`.trim();

// ═══════════════════════════════════════════════════════════════
// User Input Builder
// ═══════════════════════════════════════════════════════════════

/**
 * Build the system instructions and structured user input for
 * exhibit cover summary generation.
 */
export function buildJurisdictionAwareExhibitPrompt(input: ExhibitCoverDraftInput): {
  instructions: string;
  userInput: string;
} {
  const state = input.jurisdiction?.state || 'Unknown State';
  const county = input.jurisdiction?.county || 'Unknown County';
  const courtName = input.jurisdiction?.courtName || 'Unknown Court';

  const sections: string[] = [];

  // ── Exhibit Information ──
  sections.push('EXHIBIT INFORMATION');
  sections.push(`Label: Exhibit ${input.label}`);
  if (input.title) sections.push(`Title: ${input.title}`);
  if (input.documentType) sections.push(`Document Type: ${input.documentType}`);
  if (input.dateRange) sections.push(`Date Range: ${input.dateRange}`);

  if (input.description) {
    sections.push('');
    sections.push('Description:');
    sections.push(input.description);
  }

  if (input.indexContext) {
    sections.push('');
    sections.push('Index Context:');
    sections.push(input.indexContext);
  }

  // ── Jurisdiction Context ──
  sections.push('');
  sections.push('JURISDICTION CONTEXT');
  sections.push(`State: ${state}`);
  sections.push(`County: ${county}`);
  sections.push(`Court: ${courtName}`);

  // ── Task ──
  sections.push('');
  sections.push('TASK');
  sections.push(
    'Generate 2 to 4 neutral, factual summary lines suitable for an exhibit cover sheet.',
  );
  sections.push('');
  sections.push('Return JSON with this exact shape:');
  sections.push('{');
  sections.push('  "label": "...",');
  sections.push('  "title": "...",');
  sections.push('  "summaryLines": ["...", "..."]');
  sections.push('}');

  return {
    instructions: SYSTEM_INSTRUCTIONS,
    userInput: sections.join('\n'),
  };
}
