/**
 * Pin Auto-Reformat Types
 *
 * Shared types for the pin autofill pipeline.
 * Reuses PinnableType from the integration layer — no parallel type system.
 */

export type { PinnableType } from '@/lib/integration/types';
import type { PinnableType } from '@/lib/integration/types';

// ═══════════════════════════════════════════════════════════════
// Confidence
// ═══════════════════════════════════════════════════════════════

/**
 * AI confidence in the quality of the autofill result.
 * Internal metadata only — not displayed as a truth score.
 */
export type PinConfidence = 'low' | 'medium' | 'high';

// ═══════════════════════════════════════════════════════════════
// Runtime Constants (shared across Next.js-side files)
// ═══════════════════════════════════════════════════════════════

/**
 * Canonical set of valid pin types for runtime validation.
 *
 * Single source of truth for Next.js-side code. Convex validators
 * maintain their own copy due to the server isolation boundary.
 */
export const VALID_PIN_TYPES = new Set<string>([
  'key_fact',
  'strategy_point',
  'good_faith_point',
  'strength_highlight',
  'risk_concern',
  'hearing_prep_point',
  'draft_snippet',
  'question_to_verify',
  'timeline_anchor',
]);

/** Canonical set of valid confidence levels for runtime validation. */
export const VALID_CONFIDENCE = new Set<string>(['low', 'medium', 'high']);

// ═══════════════════════════════════════════════════════════════
// Autofill Input / Output
// ═══════════════════════════════════════════════════════════════

/** Input to the pin autofill pipeline. */
export interface PinAutofillInput {
  pinType: PinnableType;
  rawSourceText: string;
  surroundingContext?: string | null;
  sourceMessageId?: string | null;
  sourceSectionId?: string | null;
}

/** Result from the pin autofill pipeline. */
export interface PinAutofillResult {
  pinType: PinnableType;
  title: string;
  content: string;
  confidence: PinConfidence;
  detectedDate: string | null;
  rawSourceText: string;
  aiVersion: string;
}
