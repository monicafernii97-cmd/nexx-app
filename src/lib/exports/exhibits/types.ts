/**
 * Exhibit Cover Draft Types
 *
 * Contracts for the jurisdiction-aware exhibit cover summary
 * drafting service. These types flow between:
 *   buildExhibitCoverDraftInputs → generateExhibitCoverDraft → applyExhibitCoverDrafts
 */

// ═══════════════════════════════════════════════════════════════
// Input
// ═══════════════════════════════════════════════════════════════

/** Input contract for the exhibit cover summary drafting service. */
export interface ExhibitCoverDraftInput {
  /** Exhibit label (e.g. "A", "B", "1") */
  label: string;
  /** Exhibit title (e.g. "AppClose Messages – March 2026") */
  title?: string;
  /** Document type (e.g. "Text Messages", "Medical Records") */
  documentType?: string;
  /** Date range string (e.g. "March 1–March 12, 2026") */
  dateRange?: string;
  /** Raw description from the assembly layer */
  description?: string;
  /** Context from index entries */
  indexContext?: string;
  /** Jurisdiction context for tone and formality */
  jurisdiction?: {
    state?: string;
    county?: string;
    courtName?: string;
  };
}

// ═══════════════════════════════════════════════════════════════
// Output
// ═══════════════════════════════════════════════════════════════

/** Output contract from the exhibit cover summary drafting service. */
export interface ExhibitCoverDraftResult {
  /** The exhibit label this result applies to */
  label: string;
  /** AI-suggested title (or original) */
  title?: string;
  /** 2–4 neutral, factual summary lines for the cover sheet */
  summaryLines: string[];
  /** Whether this was AI-drafted or deterministic fallback */
  source: 'ai_drafted' | 'raw_fallback_no_ai';
}
