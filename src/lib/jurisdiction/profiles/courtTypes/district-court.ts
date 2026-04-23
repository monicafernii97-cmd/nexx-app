/**
 * District Court Override
 *
 * Reusable court-type delta for state-level district courts.
 */

import type { JurisdictionProfile } from '../../types';

const DISTRICT_COURT_FLAGS = {
  prayerHeadingRequired: true,
  certificateSeparatePage: true,
  signatureKeepTogether: true,
  verificationKeepTogether: true,
} as const;

export const DISTRICT_COURT_OVERRIDE: Partial<JurisdictionProfile> = {
  scope: {
    courtType: 'district_court',
  },

  sections: { ...DISTRICT_COURT_FLAGS },
  courtDocument: { ...DISTRICT_COURT_FLAGS },
};
