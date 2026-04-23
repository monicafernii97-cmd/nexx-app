/**
 * Pennsylvania Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Pennsylvania Default jurisdiction profile. */
export const PA_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'pa-default',
  version: '1.0',
  name: 'Pennsylvania State Pleading',
  state: 'Pennsylvania',

  scope: {
    country: 'US',
    state: 'PA',
  },
};
