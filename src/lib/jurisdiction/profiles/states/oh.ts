/**
 * Ohio Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Ohio Default jurisdiction profile. */
export const OH_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'oh-default',
  version: '1.0',
  name: 'Ohio State Pleading',
  state: 'Ohio',

  scope: {
    country: 'US',
    state: 'OH',
  },
};
