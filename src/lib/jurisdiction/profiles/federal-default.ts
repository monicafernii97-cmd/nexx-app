/**
 * Federal Default Jurisdiction Profile
 *
 * Covers US federal courts. Uses federal caption style,
 * justified body, numeric exhibit labels with Bates numbering.
 */

import type { JurisdictionProfile } from '../types';
import { US_DEFAULT_PROFILE } from './us-default';

export const FEDERAL_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'federal-default',
  version: '1.0',
  name: 'Federal Pleading',
  courtType: 'Federal',

  typography: {
    ...US_DEFAULT_PROFILE.typography,
    bodyAlign: 'justify',
  },

  caption: {
    style: 'federal_caption',
    causeLabel: 'CIVIL ACTION NO.',
    useThreeColumnTable: false,
  },

  sections: {
    prayerHeadingRequired: true,
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },

  // ── Export overrides ──

  court: {
    captionStyle: 'federal_caption',
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },

  exhibit: {
    ...US_DEFAULT_PROFILE.exhibit!,
    labelStyleDefault: 'numeric',
    coverPageRequired: true,
    stampedTitleRequired: true,
    batesEnabledDefault: true,
    coverSummaryTone: 'formal_neutral',
  },

  summary: {
    ...US_DEFAULT_PROFILE.summary!,
    timelineAsTable: true,
  },
};
