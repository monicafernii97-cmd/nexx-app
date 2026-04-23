/**
 * Circuit Court Override
 *
 * Reusable court-type delta for circuit courts (common in FL, VA, IL, etc.).
 */

import type { JurisdictionProfile } from '../../types';

const CIRCUIT_COURT_FLAGS = {
  prayerHeadingRequired: true,
  certificateSeparatePage: true,
  signatureKeepTogether: true,
  verificationKeepTogether: true,
} as const;

export const CIRCUIT_COURT_OVERRIDE: Partial<JurisdictionProfile> = {
  scope: {
    courtType: 'circuit_court',
  },

  sections: { ...CIRCUIT_COURT_FLAGS },
  courtDocument: { ...CIRCUIT_COURT_FLAGS },
};
