/**
 * Delaware Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Delaware Default jurisdiction profile. */
export const DE_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'de-default',
  version: '1.0',
  name: 'Delaware State Pleading',
  state: 'Delaware',

  scope: {
    country: 'US',
    state: 'DE',
  },
};
