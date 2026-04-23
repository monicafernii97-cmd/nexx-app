/**
 * Georgia Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Georgia Default jurisdiction profile. */
export const GA_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'ga-default',
  version: '1.0',
  name: 'Georgia State Pleading',
  state: 'Georgia',

  scope: {
    country: 'US',
    state: 'GA',
  },
};
