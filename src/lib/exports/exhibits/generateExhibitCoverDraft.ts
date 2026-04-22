/**
 * Exhibit Cover Draft Generator
 *
 * Calls OpenAI Responses API to generate court-safe exhibit cover
 * summaries. Uses the established getOpenAIClient() pattern.
 *
 * Behavior:
 * - Single pass + 1 retry max on malformed response
 * - Falls back to deterministic output on total failure
 * - Never blocks the export pipeline
 * - Labels source as 'ai_drafted' or 'raw_fallback_no_ai'
 */

import { getOpenAIClient } from '@/lib/openaiConversation';
import { buildJurisdictionAwareExhibitPrompt } from './buildJurisdictionAwareExhibitPrompt';
import { parseExhibitCoverDraftResponse } from './parseExhibitCoverDraftResponse';
import type { ExhibitCoverDraftInput, ExhibitCoverDraftResult } from './types';

// ═══════════════════════════════════════════════════════════════
// Model Configuration
// ═══════════════════════════════════════════════════════════════

/**
 * Model for exhibit cover drafting.
 *
 * gpt-4o-mini: lightweight structured extraction, fast, cheap.
 * This is NOT deep legal reasoning — it's constrained summarization.
 * Configurable for future upgrade without pipeline refactor.
 */
export const EXHIBIT_DRAFT_MODEL = 'gpt-4o-mini' as const;

/** Temperature: low for deterministic, consistent output. */
const EXHIBIT_DRAFT_TEMPERATURE = 0.2;

// ═══════════════════════════════════════════════════════════════
// Main Generator
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a single exhibit cover draft via AI with fallback.
 *
 * Strategy: try once → if malformed, retry once → if still fails, fallback.
 */
export async function generateExhibitCoverDraft(
  input: ExhibitCoverDraftInput,
): Promise<ExhibitCoverDraftResult> {
  const prompt = buildJurisdictionAwareExhibitPrompt(input);

  // First attempt
  const first = await tryGenerate(prompt);
  if (first.summaryLines.length >= 2) {
    return {
      label: input.label,
      title: first.title || input.title,
      summaryLines: first.summaryLines,
      source: 'ai_drafted',
    };
  }

  // Retry once
  const second = await tryGenerate(prompt);
  if (second.summaryLines.length >= 2) {
    return {
      label: input.label,
      title: second.title || input.title,
      summaryLines: second.summaryLines,
      source: 'ai_drafted',
    };
  }

  // Deterministic fallback — never returns empty
  return {
    label: input.label,
    title: input.title || `Exhibit ${input.label}`,
    summaryLines: buildFallbackSummaryLines(input),
    source: 'raw_fallback_no_ai',
  };
}

// ═══════════════════════════════════════════════════════════════
// AI Call
// ═══════════════════════════════════════════════════════════════

async function tryGenerate(prompt: { instructions: string; userInput: string }) {
  try {
    const client = getOpenAIClient();

    const response = await client.responses.create({
      model: EXHIBIT_DRAFT_MODEL,
      instructions: prompt.instructions,
      input: prompt.userInput,
      temperature: EXHIBIT_DRAFT_TEMPERATURE,
    });

    return parseExhibitCoverDraftResponse(response.output_text);
  } catch {
    return { summaryLines: [] as string[] };
  }
}

// ═══════════════════════════════════════════════════════════════
// Deterministic Fallback (CRITICAL — NEVER FAIL)
// ═══════════════════════════════════════════════════════════════

/**
 * Build deterministic, court-safe fallback summary lines.
 *
 * Guarantees: always returns 2–3 usable lines.
 * These are safe to render on exhibit cover sheets without AI.
 */
export function buildFallbackSummaryLines(input: ExhibitCoverDraftInput): string[] {
  const lines: string[] = [];

  if (input.documentType && input.dateRange) {
    lines.push(
      `This exhibit contains ${input.documentType.toLowerCase()} dated ${input.dateRange}.`,
    );
  } else if (input.documentType) {
    lines.push(
      `This exhibit contains ${input.documentType.toLowerCase()} relevant to the matters in this case.`,
    );
  }

  if (input.title) {
    lines.push(`The materials are identified as "${input.title}".`);
  }

  if (input.description) {
    lines.push(
      `The content relates to ${input.description.replace(/\.$/, '')}.`,
    );
  }

  // Guarantee minimum 2 lines — always court-safe output
  const fallbacks = [
    'This exhibit contains documents and records relevant to the matters in this case.',
    'Included are materials referenced in the proceedings.',
  ];

  while (lines.length < 2) {
    lines.push(fallbacks[lines.length] ?? fallbacks[fallbacks.length - 1]);
  }

  return lines.slice(0, 3);
}
