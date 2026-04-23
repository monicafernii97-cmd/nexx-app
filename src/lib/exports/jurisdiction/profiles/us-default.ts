/**
 * US Default Export Jurisdiction Profile
 *
 * True neutral fallback — used when no state/county/court match is found.
 * Inherits all defaults from BASE_EXPORT_PROFILE.
 */

import type { JurisdictionProfile } from '../types';
import { BASE_EXPORT_PROFILE } from './base';

export const US_DEFAULT_EXPORT_PROFILE: JurisdictionProfile = {
  ...BASE_EXPORT_PROFILE,
  key: 'us-default',
  name: 'US Default',
};
