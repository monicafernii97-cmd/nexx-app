/**
 * Exhibit Cover Draft Generator
 *
 * Calls OpenAI Responses API to generate court-safe exhibit cover
 * summaries. Uses the established getOpenAIClient() pattern.
 *
 * Behavior:
 * - Single pass + 1 retry max on malformed response
 * - 30s timeout per call (AbortController)
 * - Distinguishes auth/transport errors from parse failures
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
 * Reads from process.env.EXHIBIT_DRAFT_MODEL so ops can override
 * at runtime without a code deploy. Falls back to gpt-4o-mini.
 *
 * gpt-4o-mini: lightweight structured extraction, fast, cheap.
 * This is NOT deep legal reasoning — it's constrained summarization.
 */
export const EXHIBIT_DRAFT_MODEL =
  process.env.EXHIBIT_DRAFT_MODEL?.trim() || 'gpt-4o-mini';

/** Temperature: low for deterministic, consistent output. */
const EXHIBIT_DRAFT_TEMPERATURE = 0.2;

/** Timeout for each AI call (ms). Prevents unbounded blocking. */
const EXHIBIT_DRAFT_TIMEOUT_MS = 30_000;

// ═══════════════════════════════════════════════════════════════
// Main Generator
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a single exhibit cover draft via AI with fallback.
 *
 * Strategy: try once → if parse failure, retry once → if still fails, fallback.
 * Auth/transport errors skip retry and go straight to fallback.
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

  // Retry once — but only if the first failure was a parse issue, not auth/transport
  if (!first.nonRetryable) {
    const second = await tryGenerate(prompt);
    if (second.summaryLines.length >= 2) {
      return {
        label: input.label,
        title: second.title || input.title,
        summaryLines: second.summaryLines,
        source: 'ai_drafted',
      };
    }
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
// AI Call (with timeout + error classification)
// ═══════════════════════════════════════════════════════════════

interface TryGenerateResult {
  summaryLines: string[];
  title?: string;
  /** True if failure is auth/transport (not worth retrying) */
  nonRetryable?: boolean;
}

async function tryGenerate(prompt: {
  instructions: string;
  userInput: string;
}): Promise<TryGenerateResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXHIBIT_DRAFT_TIMEOUT_MS);

  try {
    const client = getOpenAIClient();

    const response = await client.responses.create(
      {
        model: EXHIBIT_DRAFT_MODEL,
        instructions: prompt.instructions,
        input: prompt.userInput,
        temperature: EXHIBIT_DRAFT_TEMPERATURE,
      },
      { signal: controller.signal },
    );

    clearTimeout(timeout);

    return parseExhibitCoverDraftResponse(response.output_text);
  } catch (error) {
    clearTimeout(timeout);

    // Classify error — auth/transport failures are non-retryable
    if (isNonRetryableError(error)) {
      console.warn('[ExhibitCoverDraft] Non-retryable error:', (error as Error).message);
      return { summaryLines: [], nonRetryable: true };
    }

    // Parse/timeout/unknown errors — retryable
    return { summaryLines: [] };
  }
}

/**
 * Check if an error is non-retryable (auth, configuration, or transport).
 *
 * Uses duck-typing to detect OpenAI SDK error classes without
 * requiring specific imports that may change across SDK versions.
 */
function isNonRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const err = error as { status?: number; name?: string; code?: string };

  // Authentication errors (401, 403)
  if (err.status === 401 || err.status === 403) return true;

  // OpenAI SDK error class names
  if (err.name === 'AuthenticationError') return true;
  if (err.name === 'PermissionDeniedError') return true;

  // API connection errors (DNS, network)
  if (err.name === 'APIConnectionError') return true;
  if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') return true;

  return false;
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
