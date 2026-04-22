/**
 * California Default Export Jurisdiction Profile
 */

import type { ExportJurisdictionProfile } from '../types';

export const CA_DEFAULT_EXPORT_PROFILE: ExportJurisdictionProfile = {
  key: 'ca-default',
  name: 'California Default',
  state: 'california',

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
    labelStyleDefault: 'numeric',
    coverPageRequired: false,
    indexRequired: true,
    stampedTitleRequired: true,
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
