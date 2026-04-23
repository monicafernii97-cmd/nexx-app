/**
 * Arizona Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Arizona Default jurisdiction profile. */
export const AZ_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'az-default',
  version: '1.0',
  name: 'Arizona State Pleading',
  state: 'Arizona',

  scope: {
    country: 'US',
    state: 'AZ',
  },
};
