/**
 * Florida Default Jurisdiction Profile
 *
 * Covers Florida state courts. Uses generic caption style,
 * justified body text, numeric exhibit labels.
 */

import type { JurisdictionProfile } from '../types';
import { US_DEFAULT_PROFILE } from './us-default';

export const FL_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'fl-default',
  version: '1.0',
  name: 'Florida State Pleading',
  state: 'Florida',

  typography: {
    ...US_DEFAULT_PROFILE.typography,
    bodyAlign: 'justify',
    uppercaseCaption: false,
  },

  exhibit: {
    ...US_DEFAULT_PROFILE.exhibit!,
    labelStyleDefault: 'numeric',
  },
};
