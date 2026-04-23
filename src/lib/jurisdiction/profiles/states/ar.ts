/**
 * Arkansas Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Arkansas Default jurisdiction profile. */
export const AR_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'ar-default',
  version: '1.0',
  name: 'Arkansas State Pleading',
  state: 'Arkansas',

  scope: {
    country: 'US',
    state: 'AR',
  },
};
