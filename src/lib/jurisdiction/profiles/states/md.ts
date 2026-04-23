/**
 * Maryland Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Maryland Default jurisdiction profile. */
export const MD_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'md-default',
  version: '1.0',
  name: 'Maryland State Pleading',
  state: 'Maryland',

  scope: {
    country: 'US',
    state: 'MD',
  },
};
