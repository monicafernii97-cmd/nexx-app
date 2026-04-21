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

/** UI metadata for each pinnable type. */
export interface PinOptionConfig {
  type: PinnableType;
  label: string;
  emoji: string;
}

/**
 * Canonical ordered list of pin types with display metadata.
 *
 * Single source of truth for Next.js-side code. Used by:
 *  - PinToWorkspaceModal (UI selector chips)
 *  - VALID_PIN_TYPES (runtime validation set)
 *  - PinnedItemsRail (type badge labels)
 *
 * Convex validators maintain their own copy due to the server isolation boundary.
 */
export const PIN_OPTIONS_CONFIG: readonly PinOptionConfig[] = [
  { type: 'key_fact', label: 'Key Fact', emoji: '📌' },
  { type: 'strategy_point', label: 'Strategy Point', emoji: '♟️' },
  { type: 'good_faith_point', label: 'Good-Faith Point', emoji: '🤝' },
  { type: 'strength_highlight', label: 'Strength', emoji: '💪' },
  { type: 'risk_concern', label: 'Risk / Concern', emoji: '⚠️' },
  { type: 'hearing_prep_point', label: 'Hearing Prep', emoji: '🏛️' },
  { type: 'draft_snippet', label: 'Draft Snippet', emoji: '✍️' },
  { type: 'question_to_verify', label: 'Question to Verify', emoji: '❓' },
  { type: 'timeline_anchor', label: 'Timeline Anchor', emoji: '📅' },
] as const;

/** Derived validation set — always in sync with PIN_OPTIONS_CONFIG. */
export const VALID_PIN_TYPES = new Set<string>(
  PIN_OPTIONS_CONFIG.map(o => o.type),
);

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
