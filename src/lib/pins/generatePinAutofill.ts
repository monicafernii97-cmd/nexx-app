/**
 * Pin Autofill Service
 *
 * Transforms raw selected AI response text into a concise,
 * workspace-ready pin using GPT-4o-mini structured output.
 *
 * On any failure (timeout, schema mismatch, API error),
 * falls back to trimmed raw text so the pin flow is never blocked.
 */

import { getOpenAI } from '@/lib/openai';
import {
  PIN_AUTOFILL_SYSTEM_PROMPT,
  buildPinAutofillUserPrompt,
  PIN_AUTOFILL_JSON_SCHEMA,
} from './pin-autofill-prompts';
import type { PinAutofillInput, PinAutofillResult, PinConfidence } from './types';
import { VALID_PIN_TYPES, VALID_CONFIDENCE } from './types';
import type { PinnableType } from '@/lib/integration/types';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/** Formatter version — persisted for traceability. */
export const AI_VERSION = 'pin-autofill-v1';

/** Model used for pin autofill. Configurable via env for A/B testing. */
const PIN_AUTOFILL_MODEL = process.env.OPENAI_PIN_AUTOFILL_MODEL ?? 'gpt-4o-mini';

/** Maximum time to wait for the OpenAI response (ms). */
const AUTOFILL_TIMEOUT_MS = 8_000;

/** Maximum raw source text length sent to the model. */
const MAX_SOURCE_LENGTH = 2_000;

// ═══════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a cleaned pin autofill from raw selected text.
 *
 * Always returns a valid PinAutofillResult. On failure, returns
 * a fallback result using trimmed raw text — never throws.
 */
export async function generatePinAutofill(
  input: PinAutofillInput,
): Promise<PinAutofillResult> {
  const trimmed = input.rawSourceText?.trim();

  // Guard: empty or too-short input → immediate fallback
  if (!trimmed || trimmed.length < 10) {
    return buildFallbackPinAutofill(input);
  }

  try {
    const openai = getOpenAI();

    // Truncate excessively long source text
    const truncatedSource = trimmed.length > MAX_SOURCE_LENGTH
      ? trimmed.slice(0, MAX_SOURCE_LENGTH) + '…'
      : trimmed;

    const truncatedInput: PinAutofillInput = {
      ...input,
      rawSourceText: truncatedSource,
    };

    // Build prompts
    const userPrompt = buildPinAutofillUserPrompt(truncatedInput);

    // Create an abort controller for timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AUTOFILL_TIMEOUT_MS);

    try {
      const response = await openai.chat.completions.create(
        {
          model: PIN_AUTOFILL_MODEL,
          messages: [
            { role: 'system', content: PIN_AUTOFILL_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: PIN_AUTOFILL_JSON_SCHEMA,
          },
          temperature: 0.3,
          max_tokens: 500,
        },
        { signal: controller.signal },
      );

      clearTimeout(timeout);

      // Extract and validate the response
      const raw = response.choices[0]?.message?.content;
      if (!raw) {
        console.warn('[PinAutofill] Empty response from OpenAI');
        return buildFallbackPinAutofill(input);
      }

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return validateAndBuild(parsed, input);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    // Log but never throw — fallback always works
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    console.warn(
      `[PinAutofill] ${isTimeout ? 'Timeout' : 'Error'}: ${message}`,
    );
    return buildFallbackPinAutofill(input);
  }
}

// ═══════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════

/** Validate the parsed JSON and build a typed result. */
function validateAndBuild(
  parsed: Record<string, unknown>,
  input: PinAutofillInput,
): PinAutofillResult {
  const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  const content = typeof parsed.content === 'string' ? parsed.content.trim() : '';
  const pinType = typeof parsed.pinType === 'string' && VALID_PIN_TYPES.has(parsed.pinType)
    ? (parsed.pinType as PinnableType)
    : input.pinType;
  const confidence = typeof parsed.confidence === 'string' && VALID_CONFIDENCE.has(parsed.confidence)
    ? (parsed.confidence as PinConfidence)
    : 'medium';
  const detectedDate = typeof parsed.detectedDate === 'string'
    ? parsed.detectedDate
    : null;

  // If AI returned empty/garbage, fall back
  if (!title || !content) {
    console.warn('[PinAutofill] AI returned empty title or content, using fallback');
    return buildFallbackPinAutofill(input);
  }

  return {
    pinType,
    title,
    content,
    confidence,
    detectedDate,
    rawSourceText: input.rawSourceText,
    aiVersion: AI_VERSION,
  };
}

// ═══════════════════════════════════════════════════════════════
// Fallback
// ═══════════════════════════════════════════════════════════════

/**
 * Build a fallback pin autofill from raw text.
 *
 * Used when:
 * - AI call fails / times out
 * - Response schema is invalid
 * - Input is too short
 *
 * Produces a usable result using the raw text so the modal
 * can still open and the user can edit manually.
 */
export function buildFallbackPinAutofill(
  input: PinAutofillInput,
): PinAutofillResult {
  const raw = input.rawSourceText?.trim() || '';

  // Generate a basic title from first ~60 chars
  const titleCandidate = raw.slice(0, 60).replace(/\s+/g, ' ').trim();
  const title = titleCandidate.length > 50
    ? titleCandidate.slice(0, 50) + '…'
    : titleCandidate || 'Pinned Item';

  // Use raw text as content, capped at a reasonable length
  const content = raw.length > 1000
    ? raw.slice(0, 1000) + '…'
    : raw;

  return {
    pinType: input.pinType,
    title,
    content,
    confidence: 'low',
    detectedDate: null,
    rawSourceText: input.rawSourceText,
    aiVersion: 'fallback',
  };
}
