/**
 * Florida Miami-Dade Family Court Profile
 *
 * Inherits from FL default. Miami-Dade Family Court has
 * specific filing conventions for family law matters.
 */

import type { JurisdictionProfile } from '../../../types';
import { FL_DEFAULT_PROFILE } from '../../states/fl';

/** Miami-Dade Family Court — county-specific Florida profile. */
export const FL_MIAMI_DADE_FAMILY_PROFILE: JurisdictionProfile = {
  ...FL_DEFAULT_PROFILE,
  key: 'fl-miami-dade-family',
  version: '1.0',
  name: 'Florida – Miami-Dade County – Family Division',
  county: 'Miami-Dade',

  scope: {
    country: 'US',
    state: 'FL',
    county: 'Miami-Dade',
    courtName: 'Circuit Court of the Eleventh Judicial Circuit',
    courtType: 'family_court',
  },

  sections: {
    ...(FL_DEFAULT_PROFILE.sections ?? {}),
    prayerHeadingRequired: true,
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },

  courtDocument: {
    ...(FL_DEFAULT_PROFILE.courtDocument ?? FL_DEFAULT_PROFILE.sections ?? {}),
    prayerHeadingRequired: true,
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },
};
