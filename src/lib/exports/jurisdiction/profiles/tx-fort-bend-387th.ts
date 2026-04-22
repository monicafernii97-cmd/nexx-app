/**
 * Texas Fort Bend 387th District Court Export Profile
 */

import type { ExportJurisdictionProfile } from '../types';

export const TX_FORT_BEND_387TH_EXPORT_PROFILE: ExportJurisdictionProfile = {
  key: 'tx-fort-bend-387th',
  name: 'Texas — Fort Bend County, 387th District Court',
  state: 'texas',
  county: 'fort bend',
  courtType: 'district',

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
    captionStyle: 'texas_pleading',
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },

  exhibit: {
    labelStyleDefault: 'alpha',
    coverPageRequired: true,
    indexRequired: true,
    stampedTitleRequired: true,
    batesEnabledDefault: false,
    batesPosition: 'footer-right',
    coverSummaryTone: 'formal_neutral',
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
