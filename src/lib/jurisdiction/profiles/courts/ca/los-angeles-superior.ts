/**
 * California Los Angeles Superior Court Profile
 *
 * Inherits from CA default. LA Superior Court has specific
 * filing conventions and formatting requirements.
 */

import type { JurisdictionProfile } from '../../../types';
import { CA_DEFAULT_PROFILE } from '../../states/ca';

/** Los Angeles Superior Court — county-specific California profile. */
export const CA_LOS_ANGELES_SUPERIOR_PROFILE: JurisdictionProfile = {
  ...CA_DEFAULT_PROFILE,
  key: 'ca-los-angeles-superior',
  version: '1.0',
  name: 'California – Los Angeles Superior Court',
  county: 'Los Angeles',

  scope: {
    country: 'US',
    state: 'CA',
    county: 'Los Angeles',
    courtName: 'Superior Court of California, County of Los Angeles',
    courtType: 'superior_court',
  },
};
