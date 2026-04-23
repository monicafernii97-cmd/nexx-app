/**
 * Texas Fort Bend 387th District Court Profile
 *
 * Inherits from TX default, adds county-specific metadata.
 */

import type { JurisdictionProfile } from '../types';
import { TX_DEFAULT_PROFILE } from './tx-default';

/** Fort Bend County 387th Judicial District — county-specific Texas profile. */export const TX_FORT_BEND_387TH_PROFILE: JurisdictionProfile = {
  ...TX_DEFAULT_PROFILE,
  key: 'tx-fort-bend-387th',
  version: '1.0',
  name: 'Texas – Fort Bend County – 387th Judicial District',
  county: 'Fort Bend',
  courtType: 'district',
};
