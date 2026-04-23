/**
 * County Court Override
 *
 * Reusable court-type delta for county-level courts.
 */

import type { JurisdictionProfile } from '../../types';

export const COUNTY_COURT_OVERRIDE: Partial<JurisdictionProfile> = {
  scope: {
    courtType: 'county_court',
  },

  sections: {
    prayerHeadingRequired: false,
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },

  courtDocument: {
    prayerHeadingRequired: false,
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },
};
