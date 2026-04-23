/**
 * Probate Court Override
 *
 * Reusable court-type delta for probate courts.
 * Uses In Re caption style for estate/guardianship matters.
 */

import type { JurisdictionProfile } from '../../types';

export const PROBATE_COURT_OVERRIDE: Partial<JurisdictionProfile> = {
  scope: {
    courtType: 'probate_court',
  },

  caption: {
    style: 'in_re_caption',
    causeLabel: 'CASE NO.',
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
    captionStyle: 'in_re_caption',
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },
};
