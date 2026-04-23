/**
 * Washington Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Washington Default jurisdiction profile. */
export const WA_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'wa-default',
  version: '1.0',
  name: 'Washington State Pleading',
  state: 'Washington',

  scope: {
    country: 'US',
    state: 'WA',
  },
};
