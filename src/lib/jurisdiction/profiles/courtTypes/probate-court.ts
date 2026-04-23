/**
 * Probate Court Override
 *
 * Reusable court-type delta for probate courts.
 * Uses In Re caption style for estate/guardianship matters.
 */

import type { JurisdictionProfile } from '../../types';

const PROBATE_COURT_FLAGS = {
  prayerHeadingRequired: true,
  certificateSeparatePage: true,
  signatureKeepTogether: true,
  verificationKeepTogether: true,
} as const;

export const PROBATE_COURT_OVERRIDE: Partial<JurisdictionProfile> = {
  scope: {
    courtType: 'probate_court',
  },

  caption: {
    style: 'in_re_caption',
    causeLabel: 'CASE NO.',
    useThreeColumnTable: false,
  },

  sections: { ...PROBATE_COURT_FLAGS },
  courtDocument: { ...PROBATE_COURT_FLAGS },

  court: {
    captionStyle: 'in_re_caption',
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },
};
