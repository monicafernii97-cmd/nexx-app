/**
 * County Court Override
 *
 * Reusable court-type delta for county-level courts.
 */

import type { JurisdictionProfile } from '../../types';

const COUNTY_COURT_FLAGS = {
  prayerHeadingRequired: false,
  certificateSeparatePage: true,
  signatureKeepTogether: true,
  verificationKeepTogether: true,
} as const;

export const COUNTY_COURT_OVERRIDE: Partial<JurisdictionProfile> = {
  scope: {
    courtType: 'county_court',
  },

  sections: { ...COUNTY_COURT_FLAGS },
  courtDocument: { ...COUNTY_COURT_FLAGS },
};
