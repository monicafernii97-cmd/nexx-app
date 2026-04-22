/**
 * Federal Default Export Jurisdiction Profile
 */

import type { ExportJurisdictionProfile } from '../types';

export const FEDERAL_DEFAULT_EXPORT_PROFILE: ExportJurisdictionProfile = {
  key: 'federal-default',
  name: 'Federal Default',
  courtType: 'federal',

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
    uppercaseCaption: true,
  },

  court: {
    captionStyle: 'federal_caption',
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },

  exhibit: {
    labelStyleDefault: 'numeric',
    coverPageRequired: true,
    indexRequired: true,
    stampedTitleRequired: true,
    batesEnabledDefault: true,
    batesPosition: 'footer-right',
    coverSummaryTone: 'formal_neutral',
  },

  summary: {
    includeOverviewHeading: true,
    timelineAsTable: true,
  },

  pdf: {
    preferCSSPageSize: true,
    printBackground: true,
    waitUntil: 'networkidle0',
  },
};
