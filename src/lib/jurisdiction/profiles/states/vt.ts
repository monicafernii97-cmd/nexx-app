/**
 * Vermont Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Vermont Default jurisdiction profile. */
export const VT_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'vt-default',
  version: '1.0',
  name: 'Vermont State Pleading',
  state: 'Vermont',

  scope: {
    country: 'US',
    state: 'VT',
  },
};
