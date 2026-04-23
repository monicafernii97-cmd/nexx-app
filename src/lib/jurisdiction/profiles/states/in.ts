/**
 * Indiana Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Indiana Default jurisdiction profile. */
export const IN_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'in-default',
  version: '1.0',
  name: 'Indiana State Pleading',
  state: 'Indiana',

  scope: {
    country: 'US',
    state: 'IN',
  },
};
