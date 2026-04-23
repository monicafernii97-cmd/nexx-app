/**
 * Superior Court Override
 *
 * Reusable court-type delta for superior courts (common in CA, WA, AZ, etc.).
 */

import type { JurisdictionProfile } from '../../types';

const SUPERIOR_COURT_FLAGS = {
  prayerHeadingRequired: true,
  certificateSeparatePage: true,
  signatureKeepTogether: true,
  verificationKeepTogether: true,
} as const;

export const SUPERIOR_COURT_OVERRIDE: Partial<JurisdictionProfile> = {
  scope: {
    courtType: 'superior_court',
  },

  sections: { ...SUPERIOR_COURT_FLAGS },
  courtDocument: { ...SUPERIOR_COURT_FLAGS },
};
