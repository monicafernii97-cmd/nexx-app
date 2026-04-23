/**
 * North Carolina Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** North Carolina Default jurisdiction profile. */
export const NC_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'nc-default',
  version: '1.0',
  name: 'North Carolina State Pleading',
  state: 'North Carolina',

  scope: {
    country: 'US',
    state: 'NC',
  },
};
