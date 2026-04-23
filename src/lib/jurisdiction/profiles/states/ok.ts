/**
 * Oklahoma Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Oklahoma Default jurisdiction profile. */
export const OK_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'ok-default',
  version: '1.0',
  name: 'Oklahoma State Pleading',
  state: 'Oklahoma',

  scope: {
    country: 'US',
    state: 'OK',
  },
};
