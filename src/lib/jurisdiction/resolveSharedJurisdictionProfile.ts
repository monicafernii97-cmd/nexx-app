/**
 * Shared Jurisdiction Profile Resolver
 *
 * THE SINGLE RESOLVER for both Quick Generate and Create Export.
 *
 * Layered resolution order (deterministic):
 *   1. Explicit profileKey → PROFILE_REGISTRY lookup
 *   2. Base: US default
 *   3. Layer: state default (from STATE_PROFILE_MAP)
 *   4. Layer: court-type override (from COURT_TYPE_OVERRIDES)
 *   5. Layer: specific court match (from SPECIFIC_COURT_PROFILES)
 *   6. Layer: user persisted overrides (from Convex userCourtSettings)
 *   7. Layer: case runtime override (in-memory, not persisted)
 *   8. Layer: document runtime override (in-memory, not persisted)
 *
 * Persistence and resolution are separate concerns:
 *   - This module handles resolution (merge)
 *   - Convex handles persistence (storage)
 *   - Only the user tier is persisted today
 *   - Case/document overrides are runtime-only inputs
 *
 * Returns the resolved profile + resolution metadata for observability.
 */

import type {
  JurisdictionProfile,
  CourtType,
  ProfileResolutionMeta,
  ProfileResolutionSource,
  ResolverSettingsInput,
} from './types';
import { normalizeCourtDocumentSections } from './types';

import {
  PROFILE_REGISTRY,
  STATE_PROFILE_MAP,
  STATE_NAME_TO_CODE,
  COURT_TYPE_OVERRIDES,
  SPECIFIC_COURT_PROFILES,
  US_DEFAULT_PROFILE,
  FEDERAL_DEFAULT_PROFILE,
} from './profiles/registry';

import { mergeJurisdictionProfiles } from './mergeJurisdictionProfiles';

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

export type ResolvedProfileResult = {
  profile: JurisdictionProfile;
  meta: ProfileResolutionMeta;
};

/**
 * Resolve params for the layered profile system.
 *
 * Supports all tiers of the hierarchy. Only `userOverrides` is
 * persisted today (Convex userCourtSettings). Case and document
 * overrides are runtime-only inputs.
 */
export type LayeredResolveParams = {
  state?: string;
  county?: string;
  courtName?: string;
  courtType?: CourtType | string;
  /** User-persisted formatting overrides (from Convex) */
  userOverrides?: Partial<JurisdictionProfile> | null;
  /** Case-level runtime overrides (not persisted) */
  caseOverrides?: Partial<JurisdictionProfile> | null;
  /** Document-level runtime overrides (not persisted) */
  documentOverrides?: Partial<JurisdictionProfile> | null;
};

/**
 * Resolve the best-matching jurisdiction profile from settings.
 *
 * Deterministic: same input always produces same output.
 *
 * @param settings - Court settings for matching (legacy input shape)
 * @returns Resolved profile + resolution metadata
 */
export function resolveSharedJurisdictionProfile(
  settings: ResolverSettingsInput,
): ResolvedProfileResult {
  // ── 1. Explicit profileKey ──
  if (settings?.profileKey) {
    const explicit = PROFILE_REGISTRY.get(settings.profileKey);
    if (explicit) {
      return {
        profile: normalizeCourtDocumentSections(explicit),
        meta: { profileKey: explicit.key, source: 'explicit_profile_key' },
      };
    }
    // Invalid profileKey — log and fall through to match logic
    console.warn(
      `[Jurisdiction] Invalid profileKey "${settings.profileKey}" — falling back to match logic`,
    );
  }

  if (!settings) {
    return {
      profile: normalizeCourtDocumentSections(US_DEFAULT_PROFILE),
      meta: { profileKey: 'us-default', source: 'global_default' },
    };
  }

  const state = norm(settings.state);
  const county = norm(settings.county);
  const courtName = norm(settings.courtName);
  const courtType = norm(settings.courtType);
  const venue = `${courtName} ${settings.district ?? ''}`.toLowerCase();

  // ── 2. Federal detection ──
  const isFederal =
    courtType === 'federal' ||
    courtType === 'federal_district' ||
    courtName.includes('united states district court') ||
    courtName.includes('u.s. district court') ||
    courtName.includes('us district court') ||
    /\busdc\b/.test(courtName) ||
    /\bu\.?s\.?d\.?c\.?\b/.test(courtName);

  if (isFederal) {
    return result(FEDERAL_DEFAULT_PROFILE, 'court_exact_match');
  }

  // ── 3. County-specific (legacy direct match) ──
  if (state === 'texas' && county === 'fort bend') {
    if (/\b387(th)?\b/.test(venue)) {
      return result(
        PROFILE_REGISTRY.get('tx-fort-bend-387th') ?? US_DEFAULT_PROFILE,
        'court_exact_match',
      );
    }
  }

  // ── 4. State defaults (using STATE_PROFILE_MAP) ──
  const stateCode = resolveStateCode(state);
  if (stateCode) {
    const stateProfile = STATE_PROFILE_MAP[stateCode];
    if (stateProfile) {
      return result(
        stateProfile,
        county ? 'state_fallback_unmatched_county' : 'state_default',
      );
    }
  }

  // ── 5. Global default ──
  return result(US_DEFAULT_PROFILE, 'global_default');
}

/**
 * Layered profile resolution — the full hierarchy.
 *
 * Merge order:
 *   US default → state → court type → specific court → user → case → document
 *
 * This is the recommended entry point for new code.
 */
export function resolveLayeredProfile(
  params: LayeredResolveParams,
): ResolvedProfileResult {
  const state = norm(params.state);
  const county = norm(params.county);
  const courtName = norm(params.courtName);
  const courtType = norm(params.courtType);

  // ── Resolve state code ──
  const stateCode = resolveStateCode(state);

  // ── Federal detection ──
  const isFederal =
    courtType === 'federal' ||
    courtType === 'federal_district' ||
    courtName.includes('united states district court') ||
    courtName.includes('u.s. district court') ||
    courtName.includes('us district court') ||
    /\busdc\b/.test(courtName) ||
    /\bu\.?s\.?d\.?c\.?\b/.test(courtName);

  if (isFederal) {
    const merged = mergeJurisdictionProfiles(
      FEDERAL_DEFAULT_PROFILE,
      params.userOverrides,
      params.caseOverrides,
      params.documentOverrides,
    );
    return { profile: normalizeCourtDocumentSections(merged), meta: { profileKey: 'federal-default', source: 'court_exact_match' } };
  }

  // ── State profile ──
  const stateProfile = stateCode ? (STATE_PROFILE_MAP[stateCode] ?? null) : null;

  // ── Court-type override ──
  const normalizedCourtType = normalizeCourtType(courtType);
  const courtTypeOverride = normalizedCourtType
    ? (COURT_TYPE_OVERRIDES[normalizedCourtType] ?? null)
    : null;

  // ── Specific court match ──
  const specificCourt = findSpecificCourt(stateCode, county, courtName);

  // ── Determine resolution source ──
  let source: ProfileResolutionSource = 'global_default';
  let profileKey = 'us-default';

  if (specificCourt) {
    source = 'court_exact_match';
    profileKey = specificCourt.key;
  } else if (stateProfile) {
    source = county ? 'state_fallback_unmatched_county' : 'state_default';
    profileKey = stateProfile.key;
  }

  // ── Merge all layers ──
  const merged = mergeJurisdictionProfiles(
    US_DEFAULT_PROFILE,
    stateProfile,
    courtTypeOverride,
    specificCourt,
    params.userOverrides,
    params.caseOverrides,
    params.documentOverrides,
  );

  return {
    profile: normalizeCourtDocumentSections(merged),
    meta: { profileKey, source },
  };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Normalize a string value for case-insensitive matching. */
function norm(value?: string): string {
  return (value || '').trim().toLowerCase();
}

/** Build a ResolvedProfileResult from a profile and resolution source. */
function result(
  profile: JurisdictionProfile,
  source: ProfileResolutionSource,
): ResolvedProfileResult {
  return {
    profile: normalizeCourtDocumentSections(profile),
    meta: { profileKey: profile.key, source },
  };
}

/**
 * Resolve a state input to a 2-letter code.
 * Accepts: "TX", "tx", "Texas", "texas"
 */
function resolveStateCode(state: string): string | null {
  if (!state) return null;

  // Already a 2-letter code
  const upper = state.toUpperCase();
  if (upper.length === 2 && STATE_PROFILE_MAP[upper]) {
    return upper;
  }

  // Full name lookup
  return STATE_NAME_TO_CODE[state.toLowerCase()] ?? null;
}

/**
 * Normalize a court type string to the CourtType enum.
 */
function normalizeCourtType(input: string): CourtType | null {
  if (!input) return null;

  const map: Record<string, CourtType> = {
    family_court: 'family_court',
    family: 'family_court',
    district_court: 'district_court',
    district: 'district_court',
    county_court: 'county_court',
    county: 'county_court',
    superior_court: 'superior_court',
    superior: 'superior_court',
    circuit_court: 'circuit_court',
    circuit: 'circuit_court',
    probate_court: 'probate_court',
    probate: 'probate_court',
    federal_district: 'federal_district',
    federal: 'federal_district',
  };

  return map[input] ?? null;
}

/**
 * Find a specific court profile by matching state, county, and court name.
 */
function findSpecificCourt(
  stateCode: string | null,
  county: string,
  courtName: string,
): JurisdictionProfile | null {
  if (!stateCode && !county && !courtName) return null;

  return SPECIFIC_COURT_PROFILES.find((profile) => {
    const pState = profile.scope?.state?.toUpperCase();
    const pCounty = (profile.scope?.county || '').toLowerCase();
    const pCourtName = (profile.scope?.courtName || '').toLowerCase();

    const stateMatch = !pState || pState === stateCode;
    const countyMatch = !pCounty || pCounty === county;
    const courtMatch = !pCourtName || courtName.includes(pCourtName) || pCourtName.includes(courtName);

    return stateMatch && countyMatch && (county ? countyMatch : courtMatch);
  }) ?? null;
}

// Re-export the registry for explicit key lookups
export { PROFILE_REGISTRY, STATE_PROFILE_MAP, COURT_TYPE_OVERRIDES };
