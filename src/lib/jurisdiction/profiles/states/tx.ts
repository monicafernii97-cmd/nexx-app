/**
 * Texas Default Jurisdiction Profile
 *
 * Covers Texas state courts. Uses section-symbol (§) caption
 * with three-column table layout, justified body text.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Texas Default jurisdiction profile — Texas pleading format. */
export const TX_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'tx-default',
  version: '1.0',
  name: 'Texas State Pleading',
  state: 'Texas',

  scope: {
    country: 'US',
    state: 'TX',
  },

  page: {
    ...US_DEFAULT_PROFILE.page,
    marginsPt: { top: 80, right: 78, bottom: 72, left: 78 },
  },

  typography: {
    ...US_DEFAULT_PROFILE.typography,
    lineHeightPt: 18,
    bodyAlign: 'justify',
  },

  caption: {
    style: 'texas_pleading',
    causeLabel: 'CAUSE NO.',
    useThreeColumnTable: true,
    leftWidthIn: 3.125,
    centerWidthIn: 0.083,
    rightWidthIn: 3.125,
    centerSymbol: '§',
  },

  sections: {
    prayerHeadingRequired: true,
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },

  courtDocument: {
    prayerHeadingRequired: true,
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },

  // ── Export overrides ──

  court: {
    captionStyle: 'texas_pleading',
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },

  exhibit: {
    ...US_DEFAULT_PROFILE.exhibit!,
    coverPageRequired: true,
    stampedTitleRequired: true,
    coverSummaryTone: 'formal_neutral',
  },
};
