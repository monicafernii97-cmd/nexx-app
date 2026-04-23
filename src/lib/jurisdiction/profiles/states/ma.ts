/**
 * Massachusetts Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Massachusetts Default jurisdiction profile. */
export const MA_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'ma-default',
  version: '1.0',
  name: 'Massachusetts State Pleading',
  state: 'Massachusetts',

  scope: {
    country: 'US',
    state: 'MA',
  },
};
