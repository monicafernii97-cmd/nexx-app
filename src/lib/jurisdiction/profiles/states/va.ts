/**
 * Virginia Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Virginia Default jurisdiction profile. */
export const VA_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'va-default',
  version: '1.0',
  name: 'Virginia State Pleading',
  state: 'Virginia',

  scope: {
    country: 'US',
    state: 'VA',
  },
};
