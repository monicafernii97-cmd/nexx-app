/**
 * State Default Profile Factory
 *
 * Centralizes state profile creation to prevent drift across 50+
 * state files. Ensures consistent key, scope, naming, and accuracy
 * tracking patterns.
 *
 * Usage (thin default):
 *   export const OH_DEFAULT_PROFILE = createStateDefaultProfile('OH', 'Ohio');
 *
 * Usage (enriched):
 *   export const IL_DEFAULT_PROFILE = createStateDefaultProfile('IL', 'Illinois', {
 *     accuracyStatus: 'enriched_pending_review',
 *     sourceNotes: [{ label: 'IL Supreme Court Rules', url: '...' }],
 *     overrides: { caption: { ... } },
 *   });
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Options for enriched state profiles. */
export type StateProfileEnrichment = {
  /** Profile enrichment status. Defaults to 'thin_default'. */
  accuracyStatus?: JurisdictionProfile['accuracyStatus'];
  /** Source notes for enriched profiles. */
  sourceNotes?: JurisdictionProfile['sourceNotes'];
  /** Formatting overrides to merge on top of US_DEFAULT_PROFILE. */
  overrides?: Partial<Omit<JurisdictionProfile, 'key' | 'version' | 'name' | 'state' | 'scope'>>;
};

/**
 * Create a state profile that inherits from US_DEFAULT_PROFILE
 * and optionally applies state-specific enrichment overrides.
 *
 * @param stateCode - 2-letter state code (e.g. "OH")
 * @param stateName - Full state name (e.g. "Ohio")
 * @param enrichment - Optional enrichment options
 */
export function createStateDefaultProfile(
  stateCode: string,
  stateName: string,
  enrichment?: StateProfileEnrichment,
): JurisdictionProfile {
  return {
    ...US_DEFAULT_PROFILE,
    ...(enrichment?.overrides ?? {}),
    key: `${stateCode.toLowerCase()}-default`,
    version: '1.0',
    name: `${stateName} State Pleading`,
    state: stateName,

    scope: {
      country: 'US',
      state: stateCode.toUpperCase(),
    },

    accuracyStatus: enrichment?.accuracyStatus
      ?? (enrichment?.sourceNotes || enrichment?.overrides ? undefined : 'thin_default'),
    sourceNotes: enrichment?.sourceNotes,
  };
}
