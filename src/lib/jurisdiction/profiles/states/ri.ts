/**
 * Rhode Island Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Rhode Island Default jurisdiction profile. */
export const RI_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'ri-default',
  version: '1.0',
  name: 'Rhode Island State Pleading',
  state: 'Rhode Island',

  scope: {
    country: 'US',
    state: 'RI',
  },
};
