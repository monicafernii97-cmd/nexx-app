/**
 * Shared Base Export Profile
 *
 * Common defaults shared across all jurisdiction profiles.
 * Per-jurisdiction profiles override specific fields via spread.
 * Reduces drift and ensures consistency.
 */

import type { JurisdictionProfile } from '../types';

export const BASE_EXPORT_PROFILE: JurisdictionProfile = {
  key: 'base',
  version: '1.0',
  name: 'Base',

  page: {
    size: 'Letter',
    widthIn: 8.5,
    heightIn: 11,
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
