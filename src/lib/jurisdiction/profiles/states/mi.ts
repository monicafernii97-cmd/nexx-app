/**
 * Michigan Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Michigan Default jurisdiction profile. */
export const MI_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'mi-default',
  version: '1.0',
  name: 'Michigan State Pleading',
  state: 'Michigan',

  scope: {
    country: 'US',
    state: 'MI',
  },
};
