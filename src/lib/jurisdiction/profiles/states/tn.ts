/**
 * Tennessee Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Tennessee Default jurisdiction profile. */
export const TN_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'tn-default',
  version: '1.0',
  name: 'Tennessee State Pleading',
  state: 'Tennessee',

  scope: {
    country: 'US',
    state: 'TN',
  },
};
