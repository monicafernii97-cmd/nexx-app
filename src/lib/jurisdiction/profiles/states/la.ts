/**
 * Louisiana Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Louisiana Default jurisdiction profile. */
export const LA_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'la-default',
  version: '1.0',
  name: 'Louisiana State Pleading',
  state: 'Louisiana',

  scope: {
    country: 'US',
    state: 'LA',
  },
};
