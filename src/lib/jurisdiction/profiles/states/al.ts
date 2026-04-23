/**
 * Alabama Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Alabama Default jurisdiction profile. */
export const AL_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'al-default',
  version: '1.0',
  name: 'Alabama State Pleading',
  state: 'Alabama',

  scope: {
    country: 'US',
    state: 'AL',
  },
};
