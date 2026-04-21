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
