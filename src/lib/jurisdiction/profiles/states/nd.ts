/**
 * North Dakota Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** North Dakota Default jurisdiction profile. */
export const ND_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'nd-default',
  version: '1.0',
  name: 'North Dakota State Pleading',
  state: 'North Dakota',

  scope: {
    country: 'US',
    state: 'ND',
  },
};
