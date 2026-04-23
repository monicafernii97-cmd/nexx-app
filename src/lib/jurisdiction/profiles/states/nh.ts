/**
 * New Hampshire Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** New Hampshire Default jurisdiction profile. */
export const NH_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'nh-default',
  version: '1.0',
  name: 'New Hampshire State Pleading',
  state: 'New Hampshire',

  scope: {
    country: 'US',
    state: 'NH',
  },
};
