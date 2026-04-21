/**
 * Jurisdiction-Aware Formatting Types
 *
 * JurisdictionProfile drives how rendered HTML looks — page geometry,
 * typography, caption layout, section rules, and PDF settings.
 *
 * Profiles are resolved per state/county/court and can be extended
 * over time without changing the parser.
 */

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
    romanHeadingStyle: 'roman';
    letterHeadingStyle: 'letter';
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
