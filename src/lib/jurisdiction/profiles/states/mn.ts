/**
 * Minnesota Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Minnesota Default jurisdiction profile. */
export const MN_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'mn-default',
  version: '1.0',
  name: 'Minnesota State Pleading',
  state: 'Minnesota',

  scope: {
    country: 'US',
    state: 'MN',
  },
};
