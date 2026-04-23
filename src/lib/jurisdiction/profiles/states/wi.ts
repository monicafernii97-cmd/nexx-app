/**
 * Wisconsin Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Wisconsin Default jurisdiction profile. */
export const WI_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'wi-default',
  version: '1.0',
  name: 'Wisconsin State Pleading',
  state: 'Wisconsin',

  scope: {
    country: 'US',
    state: 'WI',
  },
};
