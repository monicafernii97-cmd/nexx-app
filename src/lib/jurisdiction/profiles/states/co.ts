/**
 * Colorado Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Colorado Default jurisdiction profile. */
export const CO_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'co-default',
  version: '1.0',
  name: 'Colorado State Pleading',
  state: 'Colorado',

  scope: {
    country: 'US',
    state: 'CO',
  },
};
