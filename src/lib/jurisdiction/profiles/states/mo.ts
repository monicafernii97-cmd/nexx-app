/**
 * Missouri Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Missouri Default jurisdiction profile. */
export const MO_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'mo-default',
  version: '1.0',
  name: 'Missouri State Pleading',
  state: 'Missouri',

  scope: {
    country: 'US',
    state: 'MO',
  },
};
