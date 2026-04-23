/**
 * Nevada Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Nevada Default jurisdiction profile. */
export const NV_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'nv-default',
  version: '1.0',
  name: 'Nevada State Pleading',
  state: 'Nevada',

  scope: {
    country: 'US',
    state: 'NV',
  },
};
