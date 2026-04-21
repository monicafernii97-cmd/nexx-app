/**
 * Jurisdiction-Aware Formatting Types
 *
 * JurisdictionProfile drives how rendered HTML looks — page geometry,
 * typography, caption layout, section rules, and PDF settings.
 *
 * CourtSettings is the clean, external-facing domain contract for
 * court configuration. SavedCourtSettings (in the resolver) is the
 * Convex-native storage shape — the two are bridged by
 * mapSavedToCourtSettings().
 *
 * Profiles are resolved per state/county/court and can be extended
 * over time without changing the parser.
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
  jurisdiction: {
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

// ═══════════════════════════════════════════════════════════════
// Jurisdiction Profile
// ═══════════════════════════════════════════════════════════════

export type JurisdictionProfile = {
  key: string;
  name: string;
  state?: string;
  county?: string;
  courtType?: string;

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
  };

  caption: {
    style: 'texas_pleading' | 'federal_caption' | 'generic_state_caption';
    causeLabel: string;
    useThreeColumnTable: boolean;
    leftWidthIn?: number;
    centerWidthIn?: number;
    rightWidthIn?: number;
    centerSymbol?: string;
    uppercaseCaption: boolean;
  };

  sections: {
    romanHeadingStyle: 'roman' | 'numeric';
    letterHeadingStyle: 'letter' | 'numeric';
    prayerHeadingRequired: boolean;
    certificateSeparatePage: boolean;
    signatureKeepTogether: boolean;
  };

  filename: {
    uppercase: boolean;
    underscoresOnly: boolean;
    includeCauseNumber: boolean;
  };

  pageNumbering: {
    enabled: boolean;
    position: 'bottom-center' | 'bottom-right' | 'footer-split';
    format: 'simple' | 'x-of-y';
  };

  pdf: {
    preferCSSPageSize: boolean;
    printBackground: boolean;
    waitUntil: 'networkidle0' | 'networkidle2';
  };
};

