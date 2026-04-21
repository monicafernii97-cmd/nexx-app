/**
 * Jurisdiction Profile Resolver
 *
 * Resolves the best-matching JurisdictionProfile based on saved court
 * settings (from Convex userCourtSettings) and parsed document metadata.
 *
 * Also provides an adapter function to convert JurisdictionProfile
 * into CourtFormattingRules for the existing PDF renderer.
 *
 * Profile resolution order:
 *   specific county profile → state profile → default US profile
 *
 * Initial profiles:
 *   1. us-default       — US General Pleading (fallback)
 *   2. tx-default       — Texas State Pleading
 *   3. tx-fort-bend-387th — Texas Fort Bend County 387th
 */

import type { JurisdictionProfile } from './types';
import type { CourtFormattingRules } from '@/lib/legal/types';

// ═══════════════════════════════════════════════════════════════
// Saved Court Settings Shape
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
    lineHeightPt: 18,
    bodyAlign: 'justify',
    headingBold: true,
    uppercaseHeadings: true,
  },
  caption: {
    style: 'generic_state_caption',
    causeLabel: 'CAUSE NO.',
    useThreeColumnTable: false,
    uppercaseCaption: true,
  },
  sections: {
    romanHeadingStyle: 'roman',
    letterHeadingStyle: 'letter',
    prayerHeadingRequired: false,
    certificateSeparatePage: true,
    signatureKeepTogether: true,
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
  },
  caption: {
    style: 'texas_pleading',
    causeLabel: 'CAUSE NO.',
    useThreeColumnTable: true,
    leftWidthIn: 3.125,
    centerWidthIn: 0.083,
    rightWidthIn: 3.125,
    centerSymbol: '§',
    uppercaseCaption: true,
  },
  sections: {
    romanHeadingStyle: 'roman',
    letterHeadingStyle: 'letter',
    prayerHeadingRequired: true,
    certificateSeparatePage: true,
    signatureKeepTogether: true,
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

// ═══════════════════════════════════════════════════════════════
// Profile Resolution
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve the best-matching jurisdiction profile.
 *
 * @param settings - Saved court settings from Convex (or null for default)
 */
export function resolveJurisdictionProfile(
  settings: SavedCourtSettings,
): JurisdictionProfile {
  const state = norm(settings?.state);
  const county = norm(settings?.county);
  const venue = `${settings?.judicialDistrict ?? ''} ${settings?.courtName ?? ''}`.toLowerCase();

  // Specific county profiles — only match 387th when court/district confirms it
  if (state === 'texas' && county === 'fort bend' && /\b387(th)?\b/.test(venue)) {
    return applyFormattingOverrides(TX_FORT_BEND_387TH, settings);
  }

  // State profiles
  if (state === 'texas') {
    return applyFormattingOverrides(TX_DEFAULT_PROFILE, settings);
  }

  // Default
  return applyFormattingOverrides(US_DEFAULT_PROFILE, settings);
}

/**
 * Merge any user formatting overrides on top of the base profile.
 * Formatting overrides come from Convex userCourtSettings.formattingOverrides.
 */
function applyFormattingOverrides(
  base: JurisdictionProfile,
  settings: SavedCourtSettings,
): JurisdictionProfile {
  if (!settings?.formattingOverrides) return base;

  const overrides = settings.formattingOverrides;

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
          // fontSize changed but lineSpacing not specified — preserve base ratio
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

// ═══════════════════════════════════════════════════════════════
// Adapter: JurisdictionProfile → CourtFormattingRules
// ═══════════════════════════════════════════════════════════════

/**
 * Convert a JurisdictionProfile into CourtFormattingRules
 * so the existing pdfRenderer.ts can consume it unchanged.
 */
export function toCourtFormattingRules(profile: JurisdictionProfile): CourtFormattingRules {
  return {
    // ── Page Setup ──
    paperWidth: profile.page.widthIn,
    paperHeight: profile.page.heightIn,
    marginTop: profile.page.marginsPt.top / 72,
    marginBottom: profile.page.marginsPt.bottom / 72,
    marginLeft: profile.page.marginsPt.left / 72,
    marginRight: profile.page.marginsPt.right / 72,

    // ── Typography ──
    fontFamily: profile.typography.fontFamily.replace(/"/g, ''),
    fontSize: profile.typography.fontSizePt,
    lineSpacing: profile.typography.lineHeightPt / profile.typography.fontSizePt,
    footnoteFontSize: 10,
    bodyAlignment: profile.typography.bodyAlign,

    // ── Caption Style ──
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

    // ── Page Structure ──
    pageNumbering: profile.pageNumbering.enabled,
    pageNumberPosition: profile.pageNumbering.position,
    pageNumberFormat: profile.pageNumbering.format,
    footerEnabled: profile.pageNumbering.enabled,
    footerFontSize: 10,

    // ── Paragraph & Heading Formatting ──
    paragraphIndent: 0,
    sectionHeadingStyle: 'bold-caps',
    titleStyle: 'bold-caps-centered',
    spacingBeforeHeading: 1,
    spacingBetweenParagraphs: 1,

    // ── Required Sections ──
    // These are validation flags (does the court require these sections?),
    // not layout flags. Most US jurisdictions require both.
    requiresCertificateOfService: true,
    requiresSignatureBlock: true,
    requiresVerification: false,
    requiresCivilCaseInfoSheet: false,

    // ── E-Filing ──
    eFilingMandatory: false,
    redactionRequired: false,

    // ── Notes ──
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
// Utilities
// ═══════════════════════════════════════════════════════════════

function norm(value?: string): string {
  return (value || '').trim().toLowerCase();
}
