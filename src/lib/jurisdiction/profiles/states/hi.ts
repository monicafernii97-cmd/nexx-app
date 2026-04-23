/**
 * Hawaii Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Hawaii Default jurisdiction profile. */
export const HI_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'hi-default',
  version: '1.0',
  name: 'Hawaii State Pleading',
  state: 'Hawaii',

  scope: {
    country: 'US',
    state: 'HI',
  },
};
