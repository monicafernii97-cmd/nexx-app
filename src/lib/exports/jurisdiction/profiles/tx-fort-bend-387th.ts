/**
 * Texas Fort Bend 387th District Court Export Profile
 *
 * Inherits from TX default, adds court-specific overrides.
 */

import type { ExportJurisdictionProfile } from '../types';
import { TX_DEFAULT_EXPORT_PROFILE } from './tx-default';

export const TX_FORT_BEND_387TH_EXPORT_PROFILE: ExportJurisdictionProfile = {
  ...TX_DEFAULT_EXPORT_PROFILE,
  key: 'tx-fort-bend-387th',
  name: 'Texas — Fort Bend County, 387th District Court',
  county: 'fort bend',
  courtType: 'district',
};
