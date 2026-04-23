/**
 * Shared Profile Registry
 *
 * THE SINGLE CANONICAL REGISTRY for all jurisdiction profiles.
 *
 * Both Quick Generate and Create Export resolve from this registry.
 * No pipeline may maintain a parallel profile definition.
 *
 * To add a new jurisdiction:
 *   1. Create a profile file in this directory
 *   2. Add it to the PROFILE_REGISTRY map
 *   3. Profile automatically becomes available to both pipelines
 */

import type { JurisdictionProfile } from '../types';

import { US_DEFAULT_PROFILE } from './us-default';
import { TX_DEFAULT_PROFILE } from './tx-default';
import { TX_FORT_BEND_387TH_PROFILE } from './tx-fort-bend-387th';
import { FL_DEFAULT_PROFILE } from './fl-default';
import { CA_DEFAULT_PROFILE } from './ca-default';
import { FEDERAL_DEFAULT_PROFILE } from './federal-default';

// ═══════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════

/** Map of profileKey → JurisdictionProfile for explicit lookups. */
export const PROFILE_REGISTRY: ReadonlyMap<string, JurisdictionProfile> = new Map([
  ['us-default', US_DEFAULT_PROFILE],
  ['tx-default', TX_DEFAULT_PROFILE],
  ['tx-fort-bend-387th', TX_FORT_BEND_387TH_PROFILE],
  ['fl-default', FL_DEFAULT_PROFILE],
  ['ca-default', CA_DEFAULT_PROFILE],
  ['federal-default', FEDERAL_DEFAULT_PROFILE],
]);

// ═══════════════════════════════════════════════════════════════
// Re-exports for convenience
// ═══════════════════════════════════════════════════════════════

export {
  US_DEFAULT_PROFILE,
  TX_DEFAULT_PROFILE,
  TX_FORT_BEND_387TH_PROFILE,
  FL_DEFAULT_PROFILE,
  CA_DEFAULT_PROFILE,
  FEDERAL_DEFAULT_PROFILE,
};
