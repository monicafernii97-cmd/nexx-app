/**
 * Wyoming Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Wyoming Default jurisdiction profile. */
export const WY_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'wy-default',
  version: '1.0',
  name: 'Wyoming State Pleading',
  state: 'Wyoming',

  scope: {
    country: 'US',
    state: 'WY',
  },
};
