/**
 * South Carolina Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** South Carolina Default jurisdiction profile. */
export const SC_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'sc-default',
  version: '1.0',
  name: 'South Carolina State Pleading',
  state: 'South Carolina',

  scope: {
    country: 'US',
    state: 'SC',
  },
};
