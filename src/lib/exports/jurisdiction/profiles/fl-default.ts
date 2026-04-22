/**
 * Florida Default Export Jurisdiction Profile
 */

import type { ExportJurisdictionProfile } from '../types';

export const FL_DEFAULT_EXPORT_PROFILE: ExportJurisdictionProfile = {
  key: 'fl-default',
  name: 'Florida Default',
  state: 'florida',

  page: {
    size: 'Letter',
    marginsPt: { top: 72, right: 72, bottom: 72, left: 72 },
  },

  typography: {
    fontFamily: "'Times New Roman', Times, serif",
    fontSizePt: 12,
    lineHeightPt: 24,
    bodyAlign: 'justify',
    headingBold: true,
    uppercaseHeadings: true,
    uppercaseTitle: true,
    uppercaseCaption: false,
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
