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
 * │  ├─ page (required)              │
 * │  ├─ typography (required)        │
 * │  ├─ pdf (required)               │
 * │  ├─ caption? (QG-specific)       │
 * │  ├─ sections? (QG-specific)      │
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
    style: 'texas_pleading' | 'federal_caption' | 'generic_state_caption' | 'in_re_caption';
    causeLabel: string;
    useThreeColumnTable: boolean;
    leftWidthIn?: number;
    centerWidthIn?: number;
    rightWidthIn?: number;
    centerSymbol?: string;
  };

  sections?: {
    prayerHeadingRequired: boolean;
    certificateSeparatePage: boolean;
    signatureKeepTogether: boolean;
    /** Whether verification block should avoid page breaks inside. */
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
    captionStyle:
      | 'texas_pleading'
      | 'federal_caption'
      | 'generic_state_caption'
      | 'in_re_caption';
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
