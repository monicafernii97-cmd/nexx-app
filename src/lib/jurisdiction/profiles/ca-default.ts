/**
 * California Default Jurisdiction Profile
 *
 * Covers California state courts. Uses left-aligned body,
 * lowercase headings (CA style), numeric exhibit labels.
 */

import type { JurisdictionProfile } from '../types';
import { US_DEFAULT_PROFILE } from './us-default';

/** California Default jurisdiction profile — generic state caption. */export const CA_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'ca-default',
  version: '1.0',
  name: 'California State Pleading',
  state: 'California',

  typography: {
    ...US_DEFAULT_PROFILE.typography,
    uppercaseHeadings: false,
  },

  exhibit: {
    ...US_DEFAULT_PROFILE.exhibit!,
    labelStyleDefault: 'numeric',
    stampedTitleRequired: true,
  },
};
