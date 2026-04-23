/**
 * Jurisdiction-Aware Formatting Types (Quick Generate)
 *
 * This file defines the QG-specific CourtSettings domain contract.
 *
 * Shared profile types (JurisdictionProfile, QuickGenerateProfile)
 * are imported directly from @/lib/jurisdiction/types.
 */

// ═══════════════════════════════════════════════════════════════
// External-Facing Court Settings (Domain Contract)
// ═══════════════════════════════════════════════════════════════

/**
 * Clean, external-facing court settings contract.
 *
 * Used by:
 *  - API routes & export pipelines (domain boundary)
 *  - `loadCourtSettings()` return type
 *  - Future external integrations
 *
 * NOT coupled to Convex record shape. The internal
 * `SavedCourtSettings` is mapped to this via `mapSavedToCourtSettings()`.
 */
export type CourtSettings = {
  jurisdiction?: {
    country?: string;
    state?: string;
    county?: string;
    courtName?: string;
    courtType?: string;
    district?: string;
    division?: string;
  };
  formatting?: {
    pleadingStyle?: 'caption_table' | 'federal_caption' | 'simple_caption';
    defaultFont?: string;
    defaultFontSizePt?: number;
    lineSpacing?: number;
    pageSize?: 'LETTER' | 'A4' | 'LEGAL';
    pageMarginsPt?: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
  };
};
