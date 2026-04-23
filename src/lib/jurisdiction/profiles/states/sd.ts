/**
 * South Dakota Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** South Dakota Default jurisdiction profile. */
export const SD_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'sd-default',
  version: '1.0',
  name: 'South Dakota State Pleading',
  state: 'South Dakota',

  scope: {
    country: 'US',
    state: 'SD',
  },
};
