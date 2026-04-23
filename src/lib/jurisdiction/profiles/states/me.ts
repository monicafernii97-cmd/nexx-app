/**
 * Maine Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Maine Default jurisdiction profile. */
export const ME_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'me-default',
  version: '1.0',
  name: 'Maine State Pleading',
  state: 'Maine',

  scope: {
    country: 'US',
    state: 'ME',
  },
};
