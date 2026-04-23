/**
 * Illinois Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Illinois Default jurisdiction profile. */
export const IL_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'il-default',
  version: '1.0',
  name: 'Illinois State Pleading',
  state: 'Illinois',

  scope: {
    country: 'US',
    state: 'IL',
  },
};
