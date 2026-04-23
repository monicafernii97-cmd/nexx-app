/**
 * Shared Jurisdiction Profile Types
 *
 * THE SINGLE SOURCE OF TRUTH for jurisdiction-aware formatting.
 *
 * Both Quick Generate and Create Export pipelines resolve from this
 * shared type. Pipeline-specific blocks are optional — renderers
 * use narrowed types to enforce required fields.
 *
 * ┌──────────────────────────────────┐
 * │ JurisdictionProfile (shared)     │
 * │  ├─ scope? (layered resolution)  │
 * │  ├─ page (required)              │
 * │  ├─ typography (required)        │
 * │  ├─ pdf (required)               │
 * │  ├─ caption? (QG-specific)       │
 * │  ├─ sections? (QG-specific)      │
 * │  ├─ courtDocument? (alias)       │
 * │  ├─ filename? (QG-specific)      │
 * │  ├─ pageNumbering? (QG-specific) │
 * │  ├─ court? (Export-specific)     │
 * │  ├─ exhibit? (Export-specific)   │
 * │  ├─ summary? (Export-specific)   │
 * │  ├─ timeline? (Export-specific)  │
 * │  └─ incident? (Export-specific)  │
 * └──────────────────────────────────┘
 */

// ═══════════════════════════════════════════════════════════════
// Canonical Type Aliases
// ═══════════════════════════════════════════════════════════════

export type CaptionStyle =
  | 'texas_pleading'
  | 'federal_caption'
  | 'generic_state_caption'
  | 'in_re_caption';

export type CourtType =
  | 'district_court'
  | 'county_court'
  | 'family_court'
  | 'circuit_court'
  | 'superior_court'
  | 'probate_court'
  | 'federal_district'
  | 'other';

// ═══════════════════════════════════════════════════════════════
// Shared Jurisdiction Profile
// ═══════════════════════════════════════════════════════════════

export type JurisdictionProfile = {
  /** Unique profile identifier. Must be stable and registry-unique. */
  key: string;
  /** Version for traceability (e.g. "1.0"). */
  version: string;
  /** Human-readable profile name. */
  name: string;
  /** State this profile applies to (e.g. "Texas"). */
  state?: string;
  /** County this profile applies to. */
  county?: string;
  /** Court type (e.g. "Federal", "District"). */
  courtType?: string;

  // ── Structured scope (layered resolution) ───────────────────

  /**
   * Structured scope metadata for layered resolution.
   * Used by the resolver to match profiles in the hierarchy:
   *   US default → state → court type → specific court
   */
  scope?: {
    country?: string;
    state?: string;
    county?: string;
    courtName?: string;
    courtType?: CourtType;
  };

  // ── Shared (required) ──────────────────────────────────────

  page: {
    size: 'Letter' | 'A4' | 'Legal';
    widthIn: number;
    heightIn: number;
    marginsPt: { top: number; right: number; bottom: number; left: number };
  };

  typography: {
    fontFamily: string;
    fontSizePt: number;
    lineHeightPt: number;
    bodyAlign: 'justify' | 'left';
    headingBold: boolean;
    uppercaseHeadings: boolean;
    /** Whether the document title should be rendered in uppercase. */
    uppercaseTitle: boolean;
    /** Whether caption text should be rendered in uppercase. */
    uppercaseCaption: boolean;
  };

  pdf: {
    preferCSSPageSize: boolean;
    printBackground: boolean;
    waitUntil: 'networkidle0' | 'networkidle2';
  };

  // ── QG-specific (optional) ─────────────────────────────────

  caption?: {
    style: CaptionStyle;
    causeLabel: string;
    useThreeColumnTable: boolean;
    leftWidthIn?: number;
    centerWidthIn?: number;
    rightWidthIn?: number;
    centerSymbol?: string;
  };

  /**
   * Court document structure rules (QG-specific).
   * Internal field: `sections`. The `courtDocument` alias is
   * provided for new layered APIs.
   */
  sections?: {
    prayerHeadingRequired: boolean;
    certificateSeparatePage: boolean;
    signatureKeepTogether: boolean;
    /** Whether verification block should avoid page breaks inside. */
    verificationKeepTogether: boolean;
  };

  /**
   * Alias for `sections` — identical shape, used by new layered
   * profile APIs. During the transition period, the resolver
   * normalizes both into a single canonical shape.
   */
  courtDocument?: {
    prayerHeadingRequired: boolean;
    certificateSeparatePage: boolean;
    signatureKeepTogether: boolean;
    verificationKeepTogether: boolean;
  };

  filename?: {
    uppercase: boolean;
    underscoresOnly: boolean;
    includeCauseNumber: boolean;
  };

  pageNumbering?: {
    enabled: boolean;
    position: 'bottom-center' | 'bottom-right' | 'footer-split';
    format: 'simple' | 'x-of-y';
  };

  // ── Export-specific (optional) ─────────────────────────────

  court?: {
    captionStyle: CaptionStyle;
    certificateSeparatePage: boolean;
    signatureKeepTogether: boolean;
    verificationKeepTogether: boolean;
  };

  exhibit?: {
    labelStyleDefault: 'alpha' | 'numeric' | 'party_numeric';
    coverPageRequired: boolean;
    indexRequired: boolean;
    stampedTitleRequired: boolean;
    batesEnabledDefault: boolean;
    batesPosition: 'footer-right' | 'footer-center' | 'header-right';
    coverSummaryTone: 'formal_neutral' | 'plain_neutral';
  };

  summary?: {
    includeOverviewHeading: boolean;
    timelineAsTable: boolean;
  };

  timeline?: {
    defaultMode?: 'table' | 'visual';
  };

  incident?: {
    layout?: 'narrative' | 'timeline';
  };
};

// ═══════════════════════════════════════════════════════════════
// Narrowed Pipeline-Specific Types
// ═══════════════════════════════════════════════════════════════

/**
 * QG profile — requires caption, sections, filename, pageNumbering.
 * Used by the QG renderer after assertQuickGenerateProfile() validation.
 */
export type QuickGenerateProfile = JurisdictionProfile & {
  caption: NonNullable<JurisdictionProfile['caption']>;
  sections: NonNullable<JurisdictionProfile['sections']>;
  filename: NonNullable<JurisdictionProfile['filename']>;
  pageNumbering: NonNullable<JurisdictionProfile['pageNumbering']>;
};

/**
 * Export profile — requires court, exhibit, summary.
 * Used by export renderers after assertExportProfile() validation.
 */
export type ExportJurisdictionProfile = JurisdictionProfile & {
  court: NonNullable<JurisdictionProfile['court']>;
  exhibit: NonNullable<JurisdictionProfile['exhibit']>;
  summary: NonNullable<JurisdictionProfile['summary']>;
};

// ═══════════════════════════════════════════════════════════════
// Profile Resolution Metadata
// ═══════════════════════════════════════════════════════════════

/** How the jurisdiction profile was resolved — for observability. */
export type ProfileResolutionSource =
  | 'explicit_profile_key'
  | 'court_exact_match'
  | 'state_fallback_unmatched_county'
  | 'state_default'
  | 'global_default'
  | 'pre_resolved';

export type ProfileResolutionMeta = {
  profileKey: string;
  source: ProfileResolutionSource;
};

// ═══════════════════════════════════════════════════════════════
// Resolver Settings Input
// ═══════════════════════════════════════════════════════════════

/** Minimal settings input for profile resolution. */
export type ResolverSettingsInput = {
  profileKey?: string;
  state?: string;
  county?: string;
  courtName?: string;
  courtType?: string;
  district?: string;
} | null | undefined;

// ═══════════════════════════════════════════════════════════════
// courtDocument ↔ sections Normalization
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize courtDocument / sections aliases on a profile.
 *
 * Rules:
 *   - If courtDocument exists and sections does not → copy courtDocument to sections
 *   - If sections exists and courtDocument does not → copy sections to courtDocument
 *   - If both exist → sections wins (canonical), courtDocument mirrors it
 *   - If neither exists → no-op
 *
 * Returns a new profile object — never mutates the input.
 */
export function normalizeCourtDocumentSections(
  profile: JurisdictionProfile,
): JurisdictionProfile {
  const { sections, courtDocument } = profile;

  if (!sections && !courtDocument) return profile;

  const canonical = sections ?? courtDocument;
  return {
    ...profile,
    sections: canonical,
    courtDocument: canonical,
  };
}
