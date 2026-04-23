/**
 * Mississippi Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Mississippi Default jurisdiction profile. */
export const MS_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'ms-default',
  version: '1.0',
  name: 'Mississippi State Pleading',
  state: 'Mississippi',

  scope: {
    country: 'US',
    state: 'MS',
  },
};
