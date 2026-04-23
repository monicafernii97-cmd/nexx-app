/**
 * Iowa Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Iowa Default jurisdiction profile. */
export const IA_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'ia-default',
  version: '1.0',
  name: 'Iowa State Pleading',
  state: 'Iowa',

  scope: {
    country: 'US',
    state: 'IA',
  },
};
