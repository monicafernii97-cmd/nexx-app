/**
 * Nebraska Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Nebraska Default jurisdiction profile. */
export const NE_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'ne-default',
  version: '1.0',
  name: 'Nebraska State Pleading',
  state: 'Nebraska',

  scope: {
    country: 'US',
    state: 'NE',
  },
};
