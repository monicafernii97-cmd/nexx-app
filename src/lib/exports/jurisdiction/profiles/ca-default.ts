/**
 * California Default Export Jurisdiction Profile
 *
 * Inherits from shared base, overrides CA-specific settings.
 */

import type { ExportJurisdictionProfile } from '../types';
import { BASE_EXPORT_PROFILE } from './base';

export const CA_DEFAULT_EXPORT_PROFILE: ExportJurisdictionProfile = {
  ...BASE_EXPORT_PROFILE,
  key: 'ca-default',
  name: 'California Default',
  state: 'california',
  exhibit: {
    ...BASE_EXPORT_PROFILE.exhibit,
    labelStyleDefault: 'numeric',
    stampedTitleRequired: true,
  },
};
