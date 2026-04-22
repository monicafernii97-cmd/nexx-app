/**
 * Jurisdiction Profile Resolver
 *
 * Resolves the best-matching JurisdictionProfile based on court
 * settings and parsed document metadata.
 *
 * Also provides an adapter function to convert JurisdictionProfile
 * into CourtFormattingRules for the existing PDF renderer.
 *
 * Profile resolution order:
 *   federal → specific county → state profile → default US profile
 *
 * Built-in profiles:
 *   1. us-default          — US General Pleading (fallback)
 *   2. tx-default          — Texas State Pleading
 *   3. tx-fort-bend-387th  — Texas Fort Bend County 387th
 *   4. fl-default          — Florida State Pleading
 *   5. ca-default          — California State Pleading
 *   6. federal-default     — Federal Pleading
 */

import type { JurisdictionProfile, CourtSettings } from './types';
import type { CourtFormattingRules } from '@/lib/legal/types';

// ═══════════════════════════════════════════════════════════════
// Saved Court Settings Shape (Convex-native)
// ═══════════════════════════════════════════════════════════════

/**
 * Shape of the Convex userCourtSettings record.
 * Accepts the real Convex record directly — no intermediate abstraction.
 */
export type SavedCourtSettings = {
  state: string;
  county: string;
  courtName?: string;
  judicialDistrict?: string;
  assignedJudge?: string;
  causeNumber?: string;
  petitionerLegalName?: string;
  respondentLegalName?: string;
  petitionerRole?: 'petitioner' | 'respondent';
  formattingOverrides?: Partial<CourtFormattingRules>;
} | null | undefined;

// ═══════════════════════════════════════════════════════════════
// Built-in Profiles
// ═══════════════════════════════════════════════════════════════

const US_DEFAULT_PROFILE: JurisdictionProfile = {
  key: 'us-default',
  name: 'US General Pleading',
  page: {
    size: 'Letter',
    widthIn: 8.5,
    heightIn: 11,
    marginsPt: { top: 72, right: 72, bottom: 72, left: 72 },
  },
  typography: {
    fontFamily: '"Times New Roman", Times, serif',
    fontSizePt: 12,
    lineHeightPt: 24,
    bodyAlign: 'left',
    headingBold: true,
    uppercaseHeadings: true,
    uppercaseTitle: true,
    uppercaseCaption: true,
  },
  caption: {
    style: 'generic_state_caption',
    causeLabel: 'CASE NO.',
    useThreeColumnTable: false,
  },
  sections: {
    prayerHeadingRequired: false,
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },
  filename: {
    uppercase: true,
    underscoresOnly: true,
    includeCauseNumber: true,
  },
  pageNumbering: {
    enabled: false,
    position: 'bottom-center',
    format: 'simple',
  },
  pdf: {
    preferCSSPageSize: true,
    printBackground: true,
    waitUntil: 'networkidle0',
  },
};

const TX_DEFAULT_PROFILE: JurisdictionProfile = {
  key: 'tx-default',
  name: 'Texas State Pleading',
  state: 'Texas',
  page: {
    size: 'Letter',
    widthIn: 8.5,
    heightIn: 11,
    marginsPt: { top: 80, right: 78, bottom: 72, left: 78 },
  },
  typography: {
    fontFamily: '"Times New Roman", Times, serif',
    fontSizePt: 12,
    lineHeightPt: 18,
    bodyAlign: 'justify',
    headingBold: true,
    uppercaseHeadings: true,
    uppercaseTitle: true,
    uppercaseCaption: true,
  },
  caption: {
    style: 'texas_pleading',
    causeLabel: 'CAUSE NO.',
    useThreeColumnTable: true,
    leftWidthIn: 3.125,
    centerWidthIn: 0.083,
    rightWidthIn: 3.125,
    centerSymbol: '§',
  },
  sections: {
    prayerHeadingRequired: true,
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },
  filename: {
    uppercase: true,
    underscoresOnly: true,
    includeCauseNumber: true,
  },
  pageNumbering: {
    enabled: false,
    position: 'bottom-center',
    format: 'simple',
  },
  pdf: {
    preferCSSPageSize: true,
    printBackground: true,
    waitUntil: 'networkidle0',
  },
};

const TX_FORT_BEND_387TH: JurisdictionProfile = {
  ...TX_DEFAULT_PROFILE,
  key: 'tx-fort-bend-387th',
  name: 'Texas – Fort Bend County – 387th Judicial District',
  county: 'Fort Bend',
};

const FL_DEFAULT_PROFILE: JurisdictionProfile = {
  key: 'fl-default',
  name: 'Florida State Pleading',
  state: 'Florida',
  page: {
    size: 'Letter',
    widthIn: 8.5,
    heightIn: 11,
    marginsPt: { top: 72, right: 72, bottom: 72, left: 72 },
  },
  typography: {
    fontFamily: '"Times New Roman", Times, serif',
    fontSizePt: 12,
    lineHeightPt: 24,
    bodyAlign: 'left',
    headingBold: true,
    uppercaseHeadings: true,
    uppercaseTitle: true,
    uppercaseCaption: true,
  },
  caption: {
    style: 'generic_state_caption',
    causeLabel: 'CASE NO.',
    useThreeColumnTable: false,
  },
  sections: {
    prayerHeadingRequired: false,
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },
  filename: {
    uppercase: true,
    underscoresOnly: true,
    includeCauseNumber: true,
  },
  pageNumbering: {
    enabled: false,
    position: 'bottom-center',
    format: 'simple',
  },
  pdf: {
    preferCSSPageSize: true,
    printBackground: true,
    waitUntil: 'networkidle0',
  },
};

const CA_DEFAULT_PROFILE: JurisdictionProfile = {
  key: 'ca-default',
  name: 'California State Pleading',
  state: 'California',
  page: {
    size: 'Letter',
    widthIn: 8.5,
    heightIn: 11,
    marginsPt: { top: 72, right: 72, bottom: 72, left: 72 },
  },
  typography: {
    fontFamily: '"Times New Roman", Times, serif',
    fontSizePt: 12,
    lineHeightPt: 24,
    bodyAlign: 'left',
    headingBold: true,
    uppercaseHeadings: false,
    uppercaseTitle: true,
    uppercaseCaption: true,
  },
  caption: {
    style: 'generic_state_caption',
    causeLabel: 'CASE NO.',
    useThreeColumnTable: false,
  },
  sections: {
    prayerHeadingRequired: false,
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },
  filename: {
    uppercase: true,
    underscoresOnly: true,
    includeCauseNumber: true,
  },
  pageNumbering: {
    enabled: false,
    position: 'bottom-center',
    format: 'simple',
  },
  pdf: {
    preferCSSPageSize: true,
    printBackground: true,
    waitUntil: 'networkidle0',
  },
};

const FEDERAL_DEFAULT_PROFILE: JurisdictionProfile = {
  key: 'federal-default',
  name: 'Federal Pleading',
  courtType: 'Federal',
  page: {
    size: 'Letter',
    widthIn: 8.5,
    heightIn: 11,
    marginsPt: { top: 72, right: 72, bottom: 72, left: 72 },
  },
  typography: {
    fontFamily: '"Times New Roman", Times, serif',
    fontSizePt: 12,
    lineHeightPt: 24,
    bodyAlign: 'left',
    headingBold: true,
    uppercaseHeadings: true,
    uppercaseTitle: true,
    uppercaseCaption: true,
  },
  caption: {
    style: 'federal_caption',
    causeLabel: 'CIVIL ACTION NO.',
    useThreeColumnTable: false,
  },
  sections: {
    prayerHeadingRequired: true,
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },
  filename: {
    uppercase: true,
    underscoresOnly: true,
    includeCauseNumber: true,
  },
  pageNumbering: {
    enabled: false,
    position: 'bottom-center',
    format: 'simple',
  },
  pdf: {
    preferCSSPageSize: true,
    printBackground: true,
    waitUntil: 'networkidle0',
  },
};

// ═══════════════════════════════════════════════════════════════
// Profile Resolution
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve the best-matching jurisdiction profile.
 *
 * Accepts both `SavedCourtSettings` (Convex-native) and
 * `CourtSettings` (clean domain contract). Normalizes internally.
 */
export function resolveJurisdictionProfile(
  settings: SavedCourtSettings | CourtSettings | null | undefined,
): JurisdictionProfile {
  const { state, county, venue } = normalizeSettingsInput(settings);

  // Federal detection — matches full name and common abbreviations
  const isFederalCourt =
    venue.includes('united states district court') ||
    venue.includes('u.s. district court') ||
    venue.includes('us district court') ||
    /\busdc\b/.test(venue) ||
    /\bu\.?s\.?d\.?c\.?\b/.test(venue);

  if (isFederalCourt) {
    return applyFormattingOverrides(FEDERAL_DEFAULT_PROFILE, settings);
  }

  // Specific county profiles
  if (state === 'texas' && county === 'fort bend' && /\b387(th)?\b/.test(venue)) {
    return applyFormattingOverrides(TX_FORT_BEND_387TH, settings);
  }

  // State profiles
  if (state === 'texas') {
    return applyFormattingOverrides(TX_DEFAULT_PROFILE, settings);
  }

  if (state === 'florida') {
    return applyFormattingOverrides(FL_DEFAULT_PROFILE, settings);
  }

  if (state === 'california') {
    return applyFormattingOverrides(CA_DEFAULT_PROFILE, settings);
  }

  // Default
  return applyFormattingOverrides(US_DEFAULT_PROFILE, settings);
}

/**
 * Normalize both CourtSettings and SavedCourtSettings into
 * flat lookup values for profile matching.
 */
function normalizeSettingsInput(
  settings: SavedCourtSettings | CourtSettings | null | undefined,
): { state: string; county: string; venue: string } {
  if (!settings) {
    return { state: '', county: '', venue: '' };
  }

  // CourtSettings shape: has `.jurisdiction.state`
  if ('jurisdiction' in settings && settings.jurisdiction) {
    const j = settings.jurisdiction;
    return {
      state: norm(j.state),
      county: norm(j.county),
      venue: `${j.courtName ?? ''} ${j.district ?? ''}`.toLowerCase(),
    };
  }

  // SavedCourtSettings shape: has `.state` directly
  if ('state' in settings) {
    return {
      state: norm(settings.state),
      county: norm(settings.county),
      venue: `${settings.judicialDistrict ?? ''} ${settings.courtName ?? ''}`.toLowerCase(),
    };
  }

  return { state: '', county: '', venue: '' };
}

/**
 * Merge any user formatting overrides on top of the base profile.
 * Supports both SavedCourtSettings (Convex overrides) and
 * CourtSettings (formatting block) shapes.
 */
function applyFormattingOverrides(
  base: JurisdictionProfile,
  settings: SavedCourtSettings | CourtSettings | null | undefined,
): JurisdictionProfile {
  if (!settings) return base;

  // SavedCourtSettings with formattingOverrides
  if ('formattingOverrides' in settings && settings.formattingOverrides) {
    return applySavedOverrides(base, settings.formattingOverrides);
  }

  // CourtSettings with formatting block
  if ('formatting' in settings && settings.formatting) {
    return applyCourtSettingsFormatting(base, settings.formatting);
  }

  return base;
}

/** Apply Convex formattingOverrides (CourtFormattingRules partial). */
function applySavedOverrides(
  base: JurisdictionProfile,
  overrides: Partial<CourtFormattingRules>,
): JurisdictionProfile {
  return {
    ...base,
    page: {
      ...base.page,
      widthIn: overrides.paperWidth ?? base.page.widthIn,
      heightIn: overrides.paperHeight ?? base.page.heightIn,
      marginsPt:
        overrides.marginTop != null ||
        overrides.marginRight != null ||
        overrides.marginBottom != null ||
        overrides.marginLeft != null
        ? {
            top: (overrides.marginTop ?? base.page.marginsPt.top / 72) * 72,
            right: (overrides.marginRight ?? base.page.marginsPt.right / 72) * 72,
            bottom: (overrides.marginBottom ?? base.page.marginsPt.bottom / 72) * 72,
            left: (overrides.marginLeft ?? base.page.marginsPt.left / 72) * 72,
          }
        : base.page.marginsPt,
    },
    typography: {
      ...base.typography,
      fontFamily: overrides.fontFamily
        ? `"${overrides.fontFamily}", Times, serif`
        : base.typography.fontFamily,
      fontSizePt: overrides.fontSize ?? base.typography.fontSizePt,
      lineHeightPt: overrides.lineSpacing
        ? Math.round((overrides.fontSize ?? base.typography.fontSizePt) * overrides.lineSpacing)
        : overrides.fontSize
          ? Math.round(overrides.fontSize * (base.typography.lineHeightPt / base.typography.fontSizePt))
          : base.typography.lineHeightPt,
      bodyAlign: overrides.bodyAlignment ?? base.typography.bodyAlign,
    },
    caption: {
      ...base.caption,
      leftWidthIn: overrides.captionColumnWidths?.left ?? base.caption.leftWidthIn,
      centerWidthIn: overrides.captionColumnWidths?.center ?? base.caption.centerWidthIn,
      rightWidthIn: overrides.captionColumnWidths?.right ?? base.caption.rightWidthIn,
    },
    pageNumbering: {
      ...base.pageNumbering,
      enabled: overrides.pageNumbering ?? base.pageNumbering.enabled,
      position: overrides.pageNumberPosition ?? base.pageNumbering.position,
      format: overrides.pageNumberFormat ?? base.pageNumbering.format,
    },
  };
}

/** Apply CourtSettings.formatting overrides. */
function applyCourtSettingsFormatting(
  base: JurisdictionProfile,
  formatting: NonNullable<CourtSettings['formatting']>,
): JurisdictionProfile {
  const pageSize = formatting.pageSize;
  const pageMargins = formatting.pageMarginsPt;
  const fontFamily = formatting.defaultFont;
  const fontSizePt = formatting.defaultFontSizePt;
  const lineSpacing = formatting.lineSpacing;

  return {
    ...base,
    page: {
      ...base.page,
      size:
        pageSize === 'A4' ? 'A4' :
        pageSize === 'LEGAL' ? 'Legal' :
        pageSize === 'LETTER' ? 'Letter' :
        base.page.size,
      marginsPt: pageMargins ?? base.page.marginsPt,
    },
    typography: {
      ...base.typography,
      fontFamily: fontFamily || base.typography.fontFamily,
      fontSizePt: fontSizePt || base.typography.fontSizePt,
      lineHeightPt: lineSpacing
        ? Math.round((fontSizePt || base.typography.fontSizePt) * lineSpacing)
        : base.typography.lineHeightPt,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Adapter: JurisdictionProfile → CourtFormattingRules
// ═══════════════════════════════════════════════════════════════

/**
 * Convert a JurisdictionProfile into CourtFormattingRules
 * so the existing pdfRenderer.ts can consume it unchanged.
 */
export function toCourtFormattingRules(profile: JurisdictionProfile): CourtFormattingRules {
  return {
    paperWidth: profile.page.widthIn,
    paperHeight: profile.page.heightIn,
    marginTop: profile.page.marginsPt.top / 72,
    marginBottom: profile.page.marginsPt.bottom / 72,
    marginLeft: profile.page.marginsPt.left / 72,
    marginRight: profile.page.marginsPt.right / 72,

    fontFamily: profile.typography.fontFamily.replace(/"/g, ''),
    fontSize: profile.typography.fontSizePt,
    lineSpacing: profile.typography.lineHeightPt / profile.typography.fontSizePt,
    footnoteFontSize: 10,
    bodyAlignment: profile.typography.bodyAlign,

    captionStyle: profile.caption.style === 'texas_pleading'
      ? 'section-symbol'
      : profile.caption.style === 'federal_caption'
        ? 'versus'
        : 'centered',
    captionColumnWidths: {
      left: profile.caption.leftWidthIn ?? 3.125,
      center: profile.caption.centerWidthIn ?? 0.083,
      right: profile.caption.rightWidthIn ?? 3.125,
    },
    causeNumberPosition: 'centered-above',

    pageNumbering: profile.pageNumbering.enabled,
    pageNumberPosition: profile.pageNumbering.position,
    pageNumberFormat: profile.pageNumbering.format,
    footerEnabled: profile.pageNumbering.enabled,
    footerFontSize: 10,

    paragraphIndent: 0,
    sectionHeadingStyle: 'bold-caps',
    titleStyle: 'bold-caps-centered',
    spacingBeforeHeading: 1,
    spacingBetweenParagraphs: 1,

    requiresCertificateOfService: true,
    requiresSignatureBlock: true,
    requiresVerification: false,
    requiresCivilCaseInfoSheet: false,

    eFilingMandatory: false,
    redactionRequired: false,

    notes: [],
  };
}

// ═══════════════════════════════════════════════════════════════
// Effective Court Settings Loader
// ═══════════════════════════════════════════════════════════════

/**
 * Canonical precedence for determining effective court settings.
 *
 * Usage: call this from the route handler, passing all available sources.
 * Returns the winning settings or null (which means use resolver default).
 *
 * Precedence:
 *   1. case-level saved settings (from Convex)
 *   2. user default saved settings (from Convex)
 *   3. body.courtSettings payload fallback
 *   4. null → resolver default profile
 *
 * Do not use body.courtSettings as primary source unless an explicit
 * unsaved-override flag is passed. Saved Convex settings should win.
 */
export async function getEffectiveCourtSettings({
  convexQuery,
  payloadCourtSettings,
}: {
  /**
   * An async function that queries Convex for the user's court settings.
   * Typically: `() => convex.query(api.courtSettings.get, {})`
   */
  convexQuery: () => Promise<SavedCourtSettings>;
  /** Fallback from the request body */
  payloadCourtSettings?: Record<string, unknown> | null;
}): Promise<SavedCourtSettings> {
  try {
    // 1. Query Convex for canonical saved settings
    const saved = await convexQuery();
    if (saved) {
      console.log('[LegalDocs] Using saved Convex court settings');
      return saved;
    }
  } catch (err) {
    console.warn('[LegalDocs] Failed to load Convex court settings, falling back to payload', err);
  }

  // 2. Payload fallback
  if (payloadCourtSettings && typeof payloadCourtSettings === 'object') {
    const p = payloadCourtSettings as Record<string, unknown>;
    if (p.state) {
      console.log('[LegalDocs] Using payload court settings as fallback');
      return {
        state: String(p.state || ''),
        county: String(p.county || ''),
        courtName: typeof p.courtName === 'string' ? p.courtName : undefined,
        judicialDistrict: typeof p.judicialDistrict === 'string' ? p.judicialDistrict : undefined,
        causeNumber: typeof p.causeNumber === 'string' ? p.causeNumber : undefined,
        petitionerLegalName: typeof p.petitionerLegalName === 'string' ? p.petitionerLegalName : undefined,
        respondentLegalName: typeof p.respondentLegalName === 'string' ? p.respondentLegalName : undefined,
        formattingOverrides:
          p.formattingOverrides && typeof p.formattingOverrides === 'object'
            ? (p.formattingOverrides as Partial<CourtFormattingRules>)
            : undefined,
      };
    }
  }

  // 3. No settings available — resolver will use default profile
  console.log('[LegalDocs] No court settings found, using default jurisdiction profile');
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Domain Converter: SavedCourtSettings → CourtSettings
// ═══════════════════════════════════════════════════════════════

/**
 * Map Convex-native SavedCourtSettings to the clean external CourtSettings contract.
 *
 * This bridges the storage shape (Convex record) and the domain shape
 * (used by routes, export pipelines, and external integrations).
 *
 * Returns a minimal fallback if saved is null/undefined.
 */
export function mapSavedToCourtSettings(
  saved: SavedCourtSettings,
): CourtSettings {
  if (!saved) {
    return { jurisdiction: {} };
  }

  const overrides = saved.formattingOverrides;

  return {
    jurisdiction: {
      country: 'United States',
      state: saved.state || undefined,
      county: saved.county || undefined,
      courtName: saved.courtName,
      district: saved.judicialDistrict,
    },
    formatting: overrides
      ? {
          pleadingStyle: overrides.captionStyle === 'section-symbol'
            ? 'caption_table'
            : overrides.captionStyle === 'versus'
              ? 'federal_caption'
              : overrides.captionStyle === 'centered'
                ? 'simple_caption'
                : undefined,
          defaultFont: overrides.fontFamily
            ? `"${overrides.fontFamily}", Times, serif`
            : undefined,
          defaultFontSizePt: overrides.fontSize,
          lineSpacing: overrides.lineSpacing,
          pageSize: overrides.paperHeight === 14
            ? 'LEGAL'
            : overrides.paperHeight === 11 || !overrides.paperHeight
              ? 'LETTER'
              : undefined,
          pageMarginsPt:
            overrides.marginTop != null ||
            overrides.marginRight != null ||
            overrides.marginBottom != null ||
            overrides.marginLeft != null
              ? {
                  top: Math.round((overrides.marginTop ?? 1) * 72),
                  right: Math.round((overrides.marginRight ?? 1) * 72),
                  bottom: Math.round((overrides.marginBottom ?? 1) * 72),
                  left: Math.round((overrides.marginLeft ?? 1) * 72),
                }
              : undefined,
        }
      : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════
// Ergonomic Loader Wrapper
// ═══════════════════════════════════════════════════════════════

/**
 * Load court settings for a user/case and return the clean domain contract.
 *
 * This is the preferred entry point for routes and pipelines.
 * Internally delegates to `getEffectiveCourtSettings()`, then maps
 * the result to `CourtSettings`.
 *
 * @param convexQuery - Async function to query Convex for saved settings
 * @param payloadFallback - Optional fallback from request body
 */
export async function loadCourtSettings({
  convexQuery,
  payloadFallback,
}: {
  convexQuery: () => Promise<SavedCourtSettings>;
  payloadFallback?: Record<string, unknown> | null;
}): Promise<CourtSettings> {
  // Normalize CourtSettings-shaped payloads ({ jurisdiction: { ... } })
  // into the flat shape that getEffectiveCourtSettings expects.
  const normalizedFallback: Record<string, unknown> | null | undefined = (() => {
    if (!payloadFallback || typeof payloadFallback !== 'object') return payloadFallback;

    const j = payloadFallback.jurisdiction as Record<string, unknown> | undefined;
    if (!j || typeof j !== 'object') return payloadFallback;

    return {
      state: typeof j.state === 'string' ? j.state : '',
      county: typeof j.county === 'string' ? j.county : '',
      courtName: typeof j.courtName === 'string' ? j.courtName : undefined,
      judicialDistrict: typeof j.district === 'string' ? j.district : undefined,
    };
  })();

  const saved = await getEffectiveCourtSettings({
    convexQuery,
    payloadCourtSettings: normalizedFallback,
  });
  return mapSavedToCourtSettings(saved);
}

// ═══════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════

function norm(value?: string): string {
  return (value || '').trim().toLowerCase();
}
