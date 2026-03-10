/**
 * Court Formatting Rules — Curated State Baseline Configurations
 *
 * These rules are sourced from each state's official Rules of Civil Procedure.
 * They represent the minimum guaranteed-correct formatting requirements.
 *
 * Measurements from the user's reference Texas pleading PDF:
 *   - Page: 612 × 792 pt (8.5 × 11 in)
 *   - Left/Right margins: 78 pt (1.083 in)
 *   - Body text width: 456 pt (6.333 in)
 *   - Font: Times New Roman (TimesNewRomanPSMT / TimesNewRomanPS-BoldMT)
 *   - Size: 12.0 pt
 *   - Baseline-to-baseline: ~18 pt (1.5 line spacing)
 *   - Body alignment: justified
 *   - Caption § column at horizontal center (x ≈ 306 pt)
 */

import type { CourtFormattingRules } from './types';

// ═══════════════════════════════════════════════════════════════
// NEXX Default Formatting (fallback for any unlisted state)
// ═══════════════════════════════════════════════════════════════

export const NEXX_DEFAULTS: CourtFormattingRules = {
  // Page setup
  paperWidth: 8.5,
  paperHeight: 11,
  marginTop: 1.0,
  marginBottom: 1.0,
  marginLeft: 1.0,
  marginRight: 1.0,

  // Typography
  fontFamily: 'Times New Roman',
  fontSize: 12,
  lineSpacing: 2.0,           // double-spaced (safe default)
  footnoteFontSize: 12,
  bodyAlignment: 'left',

  // Caption
  captionStyle: 'versus',
  captionColumnWidths: { left: 3.0, center: 0.25, right: 3.0 },
  causeNumberPosition: 'centered-above',

  // Page structure
  pageNumbering: true,
  pageNumberPosition: 'bottom-center',
  pageNumberFormat: 'simple',
  footerEnabled: false,
  footerFontSize: 10,

  // Paragraph formatting
  paragraphIndent: 0.5,
  sectionHeadingStyle: 'bold-titlecase',
  titleStyle: 'bold-caps-centered',
  spacingBeforeHeading: 2,
  spacingBetweenParagraphs: 1,

  // Required sections
  requiresCertificateOfService: true,
  requiresSignatureBlock: true,
  requiresVerification: false,
  requiresCivilCaseInfoSheet: false,

  // E-Filing
  eFilingMandatory: false,
  redactionRequired: true,
  notes: [],
};

// ═══════════════════════════════════════════════════════════════
// TEXAS — Based on Texas Rules of Civil Procedure + measured PDF
// ═══════════════════════════════════════════════════════════════

export const TEXAS_RULES: CourtFormattingRules = {
  // Page setup (measured from reference PDF)
  paperWidth: 8.5,
  paperHeight: 11,
  marginTop: 1.12,             // ~80.6 pt measured top-of-text
  marginBottom: 1.0,
  marginLeft: 1.083,           // 78 pt measured
  marginRight: 1.083,          // 78 pt measured

  // Typography (measured from reference PDF)
  fontFamily: 'Times New Roman',
  fontSize: 12,
  lineSpacing: 1.5,            // measured: 18pt baseline-to-baseline for 12pt = 1.5×
  footnoteFontSize: 12,        // TRCP: footnotes must also be ≥12pt
  bodyAlignment: 'justify',    // measured: fully justified

  // Caption — Texas § column style (measured from reference PDF)
  captionStyle: 'section-symbol',
  captionColumnWidths: {
    left: 3.125,               // 225 pt measured (78→303)
    center: 0.083,             // ~6 pt measured (303→309)
    right: 3.125,              // 225 pt measured (309→534)
  },
  causeNumberPosition: 'centered-above',

  // Page structure
  pageNumbering: true,
  pageNumberPosition: 'bottom-center',
  pageNumberFormat: 'simple',
  footerEnabled: true,          // Optional: case no + doc title + page
  footerFontSize: 10,

  // Paragraph formatting
  paragraphIndent: 0.0,         // Modern TX practice: no indent, spacing between
  sectionHeadingStyle: 'bold-caps',  // Roman numeral + BOLD ALL CAPS
  titleStyle: 'bold-caps-centered',
  spacingBeforeHeading: 2,
  spacingBetweenParagraphs: 1,

  // Required sections
  requiresCertificateOfService: true,
  requiresSignatureBlock: true,
  requiresVerification: false,
  requiresCivilCaseInfoSheet: true,

  // E-Filing
  eFilingMandatory: true,
  eFilingPortal: 'eFileTexas.gov',
  redactionRequired: true,

  notes: [
    'Font size ≥12pt including footnotes (TRCP)',
    'Margins ≥1 inch on all sides (TRCP)',
    'Paper size 8.5 × 11 inches (TRCP)',
    'Page numbers required (TRCP)',
    'Quotations >2 lines may be indented and single-spaced',
    'Headings may be single-spaced',
    'E-filing mandatory via eFileTexas.gov',
    'Sensitive data must be redacted per JCIT Rule 4.8',
    'Civil Case Information Sheet required for new cases',
  ],
};

// ═══════════════════════════════════════════════════════════════
// Known County-Level Overrides (from research)
// ═══════════════════════════════════════════════════════════════

export interface CountyOverrides {
  state: string;
  county: string;
  formattingOverrides: Partial<CourtFormattingRules>;
  requiredForms: string[];
  standingOrders: string[];
  localNotes: string[];
}

export const FORT_BEND_COUNTY_TX: CountyOverrides = {
  state: 'Texas',
  county: 'Fort Bend',
  formattingOverrides: {
    // Fort Bend follows standard TX rules — no formatting overrides
  },
  requiredForms: [
    'Civil Case Information Sheet (separate lead document)',
    'VS-165 — Information on Suit Affecting the Family Relationship (cases with children)',
  ],
  standingOrders: [
    'Standing Temporary Mutual Injunctions auto-attached for divorce & SAPCR cases',
    'Standing orders for divorce with children',
    'Standing orders for divorce without children',
    'Standing orders for suits affecting parent-child relationship',
  ],
  localNotes: [
    'Case number in documents must match e-filing submission exactly',
    'Exhibits may be merged with petition OR filed as separate lead documents',
    'E-filed documents with unredacted sensitive data will be returned (since Feb 15, 2024)',
    'Email addresses not required on proposed orders, exhibits, sworn documents',
    'Contested family cases: target disposition within 6 months',
    'Uncontested family cases: target disposition within 3 months',
    'Parenting course required in cases involving minor children',
  ],
};

// ═══════════════════════════════════════════════════════════════
// State Registry — Add more states as they are curated
// ═══════════════════════════════════════════════════════════════

/** Curated state baseline rules. States not listed here use NEXX_DEFAULTS. */
export const STATE_RULES: Record<string, CourtFormattingRules> = {
  'Texas': TEXAS_RULES,
  // Future: California, New York, Florida, etc.
};

/** Curated county overrides */
export const COUNTY_OVERRIDES: Record<string, CountyOverrides> = {
  'Texas:Fort Bend': FORT_BEND_COUNTY_TX,
};

/**
 * Get the merged formatting rules for a given state + county.
 * Priority: NEXX_DEFAULTS → State baseline → County overrides → User overrides
 */
export function getMergedRules(
  state?: string,
  county?: string,
  userOverrides?: Partial<CourtFormattingRules>
): CourtFormattingRules {
  let rules = { ...NEXX_DEFAULTS };

  // Layer 2: State baseline
  if (state && STATE_RULES[state]) {
    rules = { ...rules, ...STATE_RULES[state] };
  }

  // Layer 3: County overrides
  if (state && county) {
    const key = `${state}:${county}`;
    if (COUNTY_OVERRIDES[key]?.formattingOverrides) {
      rules = { ...rules, ...COUNTY_OVERRIDES[key].formattingOverrides };
    }
  }

  // Layer 4: User overrides (highest priority)
  if (userOverrides) {
    rules = { ...rules, ...userOverrides };
  }

  return rules;
}

/**
 * Get county-specific requirements (forms, standing orders, notes)
 */
export function getCountyRequirements(state: string, county: string): CountyOverrides | null {
  const key = `${state}:${county}`;
  return COUNTY_OVERRIDES[key] ?? null;
}
