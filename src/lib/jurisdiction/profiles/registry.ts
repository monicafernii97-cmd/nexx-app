/**
 * Shared Profile Registry
 *
 * THE SINGLE CANONICAL REGISTRY for all jurisdiction profiles.
 *
 * Both Quick Generate and Create Export resolve from this registry.
 * No pipeline may maintain a parallel profile definition.
 *
 * Structure:
 *   - STATE_PROFILE_MAP: 2-letter state code → state default profile
 *   - COURT_TYPE_OVERRIDES: CourtType → Partial<JurisdictionProfile>
 *   - SPECIFIC_COURT_PROFILES: array of court-specific full profiles
 *   - PROFILE_REGISTRY: profileKey → JurisdictionProfile (legacy compat)
 *
 * To add a new jurisdiction:
 *   1. Create a profile file in the appropriate directory
 *   2. Add it to the correct map/array below
 *   3. Profile automatically becomes available to both pipelines
 */

import type { JurisdictionProfile, CourtType } from '../types';

// ── Profiles ──
import { US_DEFAULT_PROFILE } from './us-default';
import { FEDERAL_DEFAULT_PROFILE } from './federal-default';

// ── State profiles (all 50) ──
import { AL_DEFAULT_PROFILE } from './states/al';
import { AK_DEFAULT_PROFILE } from './states/ak';
import { AZ_DEFAULT_PROFILE } from './states/az';
import { AR_DEFAULT_PROFILE } from './states/ar';
import { CA_DEFAULT_PROFILE } from './states/ca';
import { CO_DEFAULT_PROFILE } from './states/co';
import { CT_DEFAULT_PROFILE } from './states/ct';
import { DE_DEFAULT_PROFILE } from './states/de';
import { FL_DEFAULT_PROFILE } from './states/fl';
import { GA_DEFAULT_PROFILE } from './states/ga';
import { HI_DEFAULT_PROFILE } from './states/hi';
import { ID_DEFAULT_PROFILE } from './states/id';
import { IL_DEFAULT_PROFILE } from './states/il';
import { IN_DEFAULT_PROFILE } from './states/in';
import { IA_DEFAULT_PROFILE } from './states/ia';
import { KS_DEFAULT_PROFILE } from './states/ks';
import { KY_DEFAULT_PROFILE } from './states/ky';
import { LA_DEFAULT_PROFILE } from './states/la';
import { ME_DEFAULT_PROFILE } from './states/me';
import { MD_DEFAULT_PROFILE } from './states/md';
import { MA_DEFAULT_PROFILE } from './states/ma';
import { MI_DEFAULT_PROFILE } from './states/mi';
import { MN_DEFAULT_PROFILE } from './states/mn';
import { MS_DEFAULT_PROFILE } from './states/ms';
import { MO_DEFAULT_PROFILE } from './states/mo';
import { MT_DEFAULT_PROFILE } from './states/mt';
import { NE_DEFAULT_PROFILE } from './states/ne';
import { NV_DEFAULT_PROFILE } from './states/nv';
import { NH_DEFAULT_PROFILE } from './states/nh';
import { NJ_DEFAULT_PROFILE } from './states/nj';
import { NM_DEFAULT_PROFILE } from './states/nm';
import { NY_DEFAULT_PROFILE } from './states/ny';
import { NC_DEFAULT_PROFILE } from './states/nc';
import { ND_DEFAULT_PROFILE } from './states/nd';
import { OH_DEFAULT_PROFILE } from './states/oh';
import { OK_DEFAULT_PROFILE } from './states/ok';
import { OR_DEFAULT_PROFILE } from './states/or';
import { PA_DEFAULT_PROFILE } from './states/pa';
import { RI_DEFAULT_PROFILE } from './states/ri';
import { SC_DEFAULT_PROFILE } from './states/sc';
import { SD_DEFAULT_PROFILE } from './states/sd';
import { TN_DEFAULT_PROFILE } from './states/tn';
import { TX_DEFAULT_PROFILE } from './states/tx';
import { UT_DEFAULT_PROFILE } from './states/ut';
import { VT_DEFAULT_PROFILE } from './states/vt';
import { VA_DEFAULT_PROFILE } from './states/va';
import { WA_DEFAULT_PROFILE } from './states/wa';
import { WV_DEFAULT_PROFILE } from './states/wv';
import { WI_DEFAULT_PROFILE } from './states/wi';
import { WY_DEFAULT_PROFILE } from './states/wy';

// ── Court-type overrides ──
import { FAMILY_COURT_OVERRIDE } from './courtTypes/family-court';
import { DISTRICT_COURT_OVERRIDE } from './courtTypes/district-court';
import { COUNTY_COURT_OVERRIDE } from './courtTypes/county-court';
import { SUPERIOR_COURT_OVERRIDE } from './courtTypes/superior-court';
import { CIRCUIT_COURT_OVERRIDE } from './courtTypes/circuit-court';
import { PROBATE_COURT_OVERRIDE } from './courtTypes/probate-court';
import { FEDERAL_DISTRICT_OVERRIDE } from './courtTypes/federal-district';

// ── Specific court profiles ──
import { TX_FORT_BEND_387TH_PROFILE } from './courts/tx/fort-bend-387th';
import { CA_LOS_ANGELES_SUPERIOR_PROFILE } from './courts/ca/los-angeles-superior';
import { FL_MIAMI_DADE_FAMILY_PROFILE } from './courts/fl/miami-dade-family';

// ═══════════════════════════════════════════════════════════════
// State Profile Map (all 50)
// ═══════════════════════════════════════════════════════════════

/**
 * Two-letter state code → state default profile.
 * Used by the layered resolver for state-tier lookup.
 */
export const STATE_PROFILE_MAP: Readonly<Record<string, JurisdictionProfile>> = {
  AL: AL_DEFAULT_PROFILE,
  AK: AK_DEFAULT_PROFILE,
  AZ: AZ_DEFAULT_PROFILE,
  AR: AR_DEFAULT_PROFILE,
  CA: CA_DEFAULT_PROFILE,
  CO: CO_DEFAULT_PROFILE,
  CT: CT_DEFAULT_PROFILE,
  DE: DE_DEFAULT_PROFILE,
  FL: FL_DEFAULT_PROFILE,
  GA: GA_DEFAULT_PROFILE,
  HI: HI_DEFAULT_PROFILE,
  ID: ID_DEFAULT_PROFILE,
  IL: IL_DEFAULT_PROFILE,
  IN: IN_DEFAULT_PROFILE,
  IA: IA_DEFAULT_PROFILE,
  KS: KS_DEFAULT_PROFILE,
  KY: KY_DEFAULT_PROFILE,
  LA: LA_DEFAULT_PROFILE,
  ME: ME_DEFAULT_PROFILE,
  MD: MD_DEFAULT_PROFILE,
  MA: MA_DEFAULT_PROFILE,
  MI: MI_DEFAULT_PROFILE,
  MN: MN_DEFAULT_PROFILE,
  MS: MS_DEFAULT_PROFILE,
  MO: MO_DEFAULT_PROFILE,
  MT: MT_DEFAULT_PROFILE,
  NE: NE_DEFAULT_PROFILE,
  NV: NV_DEFAULT_PROFILE,
  NH: NH_DEFAULT_PROFILE,
  NJ: NJ_DEFAULT_PROFILE,
  NM: NM_DEFAULT_PROFILE,
  NY: NY_DEFAULT_PROFILE,
  NC: NC_DEFAULT_PROFILE,
  ND: ND_DEFAULT_PROFILE,
  OH: OH_DEFAULT_PROFILE,
  OK: OK_DEFAULT_PROFILE,
  OR: OR_DEFAULT_PROFILE,
  PA: PA_DEFAULT_PROFILE,
  RI: RI_DEFAULT_PROFILE,
  SC: SC_DEFAULT_PROFILE,
  SD: SD_DEFAULT_PROFILE,
  TN: TN_DEFAULT_PROFILE,
  TX: TX_DEFAULT_PROFILE,
  UT: UT_DEFAULT_PROFILE,
  VT: VT_DEFAULT_PROFILE,
  VA: VA_DEFAULT_PROFILE,
  WA: WA_DEFAULT_PROFILE,
  WV: WV_DEFAULT_PROFILE,
  WI: WI_DEFAULT_PROFILE,
  WY: WY_DEFAULT_PROFILE,
};

// ═══════════════════════════════════════════════════════════════
// State Name → Code Lookup
// ═══════════════════════════════════════════════════════════════

/**
 * Full state name → 2-letter code (case-insensitive lookup).
 * Used to normalize state input from "Texas" → "TX".
 */
export const STATE_NAME_TO_CODE: Readonly<Record<string, string>> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR',
  california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
  kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
  'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY',
};

// ═══════════════════════════════════════════════════════════════
// Court-Type Overrides
// ═══════════════════════════════════════════════════════════════

/**
 * CourtType → Partial<JurisdictionProfile> override.
 * Applied on top of the state profile when court type is known.
 */
export const COURT_TYPE_OVERRIDES: Readonly<Record<CourtType, Partial<JurisdictionProfile> | null>> = {
  family_court: FAMILY_COURT_OVERRIDE,
  district_court: DISTRICT_COURT_OVERRIDE,
  county_court: COUNTY_COURT_OVERRIDE,
  superior_court: SUPERIOR_COURT_OVERRIDE,
  circuit_court: CIRCUIT_COURT_OVERRIDE,
  probate_court: PROBATE_COURT_OVERRIDE,
  federal_district: FEDERAL_DISTRICT_OVERRIDE,
  other: null,
};

// ═══════════════════════════════════════════════════════════════
// Specific Court Profiles
// ═══════════════════════════════════════════════════════════════

/**
 * High-value specific court profiles.
 * Only added when usage justifies the maintenance cost.
 */
export const SPECIFIC_COURT_PROFILES: readonly JurisdictionProfile[] = [
  TX_FORT_BEND_387TH_PROFILE,
  CA_LOS_ANGELES_SUPERIOR_PROFILE,
  FL_MIAMI_DADE_FAMILY_PROFILE,
];

// ═══════════════════════════════════════════════════════════════
// Legacy Registry (backward compat)
// ═══════════════════════════════════════════════════════════════

/**
 * All registered profiles — profileKey → JurisdictionProfile.
 * Used for explicit profileKey lookups.
 */
const ALL_PROFILES: readonly JurisdictionProfile[] = [
  US_DEFAULT_PROFILE,
  FEDERAL_DEFAULT_PROFILE,
  ...Object.values(STATE_PROFILE_MAP),
  ...SPECIFIC_COURT_PROFILES,
];

/** Map of profileKey → JurisdictionProfile for explicit lookups. */
export const PROFILE_REGISTRY: ReadonlyMap<string, JurisdictionProfile> = new Map(
  ALL_PROFILES.map((p) => [p.key, p]),
);

// ═══════════════════════════════════════════════════════════════
// Re-exports for convenience
// ═══════════════════════════════════════════════════════════════

export {
  US_DEFAULT_PROFILE,
  TX_DEFAULT_PROFILE,
  TX_FORT_BEND_387TH_PROFILE,
  FL_DEFAULT_PROFILE,
  CA_DEFAULT_PROFILE,
  NY_DEFAULT_PROFILE,
  FEDERAL_DEFAULT_PROFILE,
  CA_LOS_ANGELES_SUPERIOR_PROFILE,
  FL_MIAMI_DADE_FAMILY_PROFILE,
};

// Court-type override re-exports
export {
  FAMILY_COURT_OVERRIDE,
  DISTRICT_COURT_OVERRIDE,
  COUNTY_COURT_OVERRIDE,
  SUPERIOR_COURT_OVERRIDE,
  CIRCUIT_COURT_OVERRIDE,
  PROBATE_COURT_OVERRIDE,
  FEDERAL_DISTRICT_OVERRIDE,
};
