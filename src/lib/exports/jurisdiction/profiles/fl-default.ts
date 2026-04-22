/**
 * Florida Default Export Jurisdiction Profile
 *
 * Inherits from shared base, overrides FL-specific settings.
 */

import type { ExportJurisdictionProfile } from '../types';
import { BASE_EXPORT_PROFILE } from './base';

export const FL_DEFAULT_EXPORT_PROFILE: ExportJurisdictionProfile = {
  ...BASE_EXPORT_PROFILE,
  key: 'fl-default',
  name: 'Florida Default',
  state: 'florida',
  typography: {
    ...BASE_EXPORT_PROFILE.typography,
    bodyAlign: 'justify',
    uppercaseCaption: false,
  },
  exhibit: {
    ...BASE_EXPORT_PROFILE.exhibit,
    labelStyleDefault: 'numeric',
  },
};
