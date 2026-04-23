/**
 * New York Default Jurisdiction Profile
 *
 * Covers New York state courts. Uses generic caption style
 * with left-aligned body text and "INDEX NO." cause label.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** New York Default jurisdiction profile — NY state caption. */
export const NY_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'ny-default',
  version: '1.0',
  name: 'New York State Pleading',
  state: 'New York',

  scope: {
    country: 'US',
    state: 'NY',
  },

  typography: {
    ...US_DEFAULT_PROFILE.typography,
    bodyAlign: 'left',
  },

  caption: {
    ...US_DEFAULT_PROFILE.caption!,
    causeLabel: 'INDEX NO.',
  },

  exhibit: {
    ...US_DEFAULT_PROFILE.exhibit!,
    labelStyleDefault: 'numeric',
  },
};
