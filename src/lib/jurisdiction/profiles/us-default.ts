/**
 * US Default Jurisdiction Profile
 *
 * Neutral fallback — used when no state/county/court match is found.
 * All optional blocks populated for both pipelines.
 */

import type { JurisdictionProfile } from '../types';

/** US Default jurisdiction profile — generic federal/state fallback. */export const US_DEFAULT_PROFILE: JurisdictionProfile = {
  key: 'us-default',
  version: '1.0',
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
    lineHeightPt: 24,
    bodyAlign: 'left',
    headingBold: true,
    uppercaseHeadings: true,
    uppercaseTitle: true,
    uppercaseCaption: true,
  },

  pdf: {
    preferCSSPageSize: true,
    printBackground: true,
    waitUntil: 'networkidle0',
  },

  // ── QG blocks ──

  caption: {
    style: 'generic_state_caption',
    causeLabel: 'CASE NO.',
    useThreeColumnTable: false,
  },

  sections: {
    prayerHeadingRequired: false,
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
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

  // ── Export blocks ──

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

  timeline: {
    defaultMode: 'table',
  },

  incident: {
    layout: 'narrative',
  },
};
