/**
 * Kentucky Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Kentucky Default jurisdiction profile. */
export const KY_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'ky-default',
  version: '1.0',
  name: 'Kentucky State Pleading',
  state: 'Kentucky',

  scope: {
    country: 'US',
    state: 'KY',
  },
};
