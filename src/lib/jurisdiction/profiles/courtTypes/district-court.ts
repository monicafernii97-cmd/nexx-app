/**
 * District Court Override
 *
 * Reusable court-type delta for state-level district courts.
 */

import type { JurisdictionProfile } from '../../types';

export const DISTRICT_COURT_OVERRIDE: Partial<JurisdictionProfile> = {
  scope: {
    courtType: 'district_court',
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
};
