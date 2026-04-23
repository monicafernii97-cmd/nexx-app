/**
 * Montana Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Montana Default jurisdiction profile. */
export const MT_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'mt-default',
  version: '1.0',
  name: 'Montana State Pleading',
  state: 'Montana',

  scope: {
    country: 'US',
    state: 'MT',
  },
};
