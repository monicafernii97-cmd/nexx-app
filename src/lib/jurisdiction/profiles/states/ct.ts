/**
 * Connecticut Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Connecticut Default jurisdiction profile. */
export const CT_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'ct-default',
  version: '1.0',
  name: 'Connecticut State Pleading',
  state: 'Connecticut',

  scope: {
    country: 'US',
    state: 'CT',
  },
};
