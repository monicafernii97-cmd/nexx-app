/**
 * New Mexico Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** New Mexico Default jurisdiction profile. */
export const NM_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'nm-default',
  version: '1.0',
  name: 'New Mexico State Pleading',
  state: 'New Mexico',

  scope: {
    country: 'US',
    state: 'NM',
  },
};
