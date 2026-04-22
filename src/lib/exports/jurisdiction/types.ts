/**
 * Export Jurisdiction Profile Types
 *
 * Extends the base jurisdiction profile concept with export-specific
 * settings, including exhibit labeling, cover requirements, bates
 * numbering, and summary tone.
 *
 * This is a TYPE-ONLY file — no resolver yet. Future work will add
 * profile resolution based on state/county/court combinations.
 */

/** Jurisdiction-specific formatting profile for the export pipeline. */
export interface ExportJurisdictionProfile {
  key: string;
  name: string;
  state?: string;
  county?: string;
  courtType?: string;

  page: {
    size: 'Letter' | 'A4' | 'Legal';
    marginsPt: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
  };

  typography: {
    fontFamily: string;
    fontSizePt: number;
    lineHeightPt: number;
    bodyAlign: 'justify' | 'left';
    headingBold: boolean;
    uppercaseHeadings: boolean;
    uppercaseTitle: boolean;
    uppercaseCaption: boolean;
  };

  court: {
    captionStyle:
      | 'texas_pleading'
      | 'federal_caption'
      | 'generic_state_caption'
      | 'in_re_caption';
    certificateSeparatePage: boolean;
    signatureKeepTogether: boolean;
    verificationKeepTogether: boolean;
  };

  exhibit: {
    labelStyleDefault: 'alpha' | 'numeric' | 'party_numeric';
    coverPageRequired: boolean;
    indexRequired: boolean;
    stampedTitleRequired: boolean;
    batesEnabledDefault: boolean;
    batesPosition: 'footer-right' | 'footer-center' | 'header-right';
    coverSummaryTone: 'formal_neutral' | 'plain_neutral';
  };

  summary: {
    includeOverviewHeading: boolean;
    timelineAsTable: boolean;
  };

  pdf: {
    preferCSSPageSize: boolean;
    printBackground: boolean;
    waitUntil: 'networkidle0' | 'networkidle2';
  };
}
