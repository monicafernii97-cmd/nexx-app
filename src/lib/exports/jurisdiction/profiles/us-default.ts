/**
 * US Default Export Jurisdiction Profile
 *
 * True neutral fallback — used when no state/county/court match is found.
 * Report-style defaults, NOT pleading-style. Non-court exports must
 * never inherit Texas-specific formatting.
 */

import type { ExportJurisdictionProfile } from '../types';

export const US_DEFAULT_EXPORT_PROFILE: ExportJurisdictionProfile = {
  key: 'us-default',
  name: 'US Default',

  page: {
    size: 'Letter',
    marginsPt: { top: 72, right: 72, bottom: 72, left: 72 },
  },

  typography: {
    fontFamily: "'Times New Roman', Times, serif",
    fontSizePt: 12,
    lineHeightPt: 24,
    bodyAlign: 'left',
    headingBold: true,
    uppercaseHeadings: true,
    uppercaseTitle: true,
    uppercaseCaption: true,
  },

  court: {
    captionStyle: 'generic_state_caption',
    certificateSeparatePage: false,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },

  exhibit: {
    labelStyleDefault: 'alpha',
    coverPageRequired: false,
    indexRequired: true,
    stampedTitleRequired: false,
    batesEnabledDefault: false,
    batesPosition: 'footer-right',
    coverSummaryTone: 'plain_neutral',
  },

  summary: {
    includeOverviewHeading: true,
    timelineAsTable: false,
  },

  pdf: {
    preferCSSPageSize: true,
    printBackground: true,
    waitUntil: 'networkidle0',
  },
};
