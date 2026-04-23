/**
 * Superior Court Override
 *
 * Reusable court-type delta for superior courts (common in CA, WA, AZ, etc.).
 */

import type { JurisdictionProfile } from '../../types';

export const SUPERIOR_COURT_OVERRIDE: Partial<JurisdictionProfile> = {
  scope: {
    courtType: 'superior_court',
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
