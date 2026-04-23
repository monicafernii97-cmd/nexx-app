/**
 * State Default Profile Factory
 *
 * Centralizes thin state profile creation to prevent drift
 * across 50+ state files. Ensures consistent key, scope, and
 * naming patterns.
 *
 * Usage:
 *   export const OH_DEFAULT_PROFILE = createStateDefaultProfile('OH', 'Ohio');
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/**
 * Create a thin state default profile that inherits everything
 * from US_DEFAULT_PROFILE and sets only the identity fields.
 *
 * @param stateCode - 2-letter state code (e.g. "OH")
 * @param stateName - Full state name (e.g. "Ohio")
 */
export function createStateDefaultProfile(
  stateCode: string,
  stateName: string,
): JurisdictionProfile {
  return {
    ...US_DEFAULT_PROFILE,
    key: `${stateCode.toLowerCase()}-default`,
    version: '1.0',
    name: `${stateName} State Pleading`,
    state: stateName,

    scope: {
      country: 'US',
      state: stateCode.toUpperCase(),
    },
  };
}
