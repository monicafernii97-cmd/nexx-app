/**
 * Circuit Court Override
 *
 * Reusable court-type delta for circuit courts (common in FL, VA, IL, etc.).
 */

import type { JurisdictionProfile } from '../../types';

export const CIRCUIT_COURT_OVERRIDE: Partial<JurisdictionProfile> = {
  scope: {
    courtType: 'circuit_court',
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
