/**
 * West Virginia Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** West Virginia Default jurisdiction profile. */
export const WV_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'wv-default',
  version: '1.0',
  name: 'West Virginia State Pleading',
  state: 'West Virginia',

  scope: {
    country: 'US',
    state: 'WV',
  },
};
