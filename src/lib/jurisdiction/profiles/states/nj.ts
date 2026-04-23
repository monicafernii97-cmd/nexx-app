/**
 * New Jersey Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** New Jersey Default jurisdiction profile. */
export const NJ_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'nj-default',
  version: '1.0',
  name: 'New Jersey State Pleading',
  state: 'New Jersey',

  scope: {
    country: 'US',
    state: 'NJ',
  },
};
