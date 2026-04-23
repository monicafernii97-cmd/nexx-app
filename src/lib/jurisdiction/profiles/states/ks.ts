/**
 * Kansas Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Kansas Default jurisdiction profile. */
export const KS_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'ks-default',
  version: '1.0',
  name: 'Kansas State Pleading',
  state: 'Kansas',

  scope: {
    country: 'US',
    state: 'KS',
  },
};
