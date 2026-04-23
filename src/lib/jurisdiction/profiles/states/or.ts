/**
 * Oregon Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Oregon Default jurisdiction profile. */
export const OR_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'or-default',
  version: '1.0',
  name: 'Oregon State Pleading',
  state: 'Oregon',

  scope: {
    country: 'US',
    state: 'OR',
  },
};
