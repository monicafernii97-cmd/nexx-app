/**
 * Utah Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Utah Default jurisdiction profile. */
export const UT_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'ut-default',
  version: '1.0',
  name: 'Utah State Pleading',
  state: 'Utah',

  scope: {
    country: 'US',
    state: 'UT',
  },
};
