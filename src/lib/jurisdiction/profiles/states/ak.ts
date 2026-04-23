/**
 * Alaska Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Alaska Default jurisdiction profile. */
export const AK_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'ak-default',
  version: '1.0',
  name: 'Alaska State Pleading',
  state: 'Alaska',

  scope: {
    country: 'US',
    state: 'AK',
  },
};
