/**
 * Federal District Court Override
 *
 * Reusable court-type delta for US federal district courts.
 * Uses federal caption style, CIVIL ACTION NO. label, Bates numbering.
 */

import type { JurisdictionProfile } from '../../types';

export const FEDERAL_DISTRICT_OVERRIDE: Partial<JurisdictionProfile> = {
  scope: {
    courtType: 'federal_district',
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

  courtDocument: {
    prayerHeadingRequired: true,
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
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
};
