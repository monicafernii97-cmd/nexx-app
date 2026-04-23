/**
 * Shared Jurisdiction Profile Resolver
 *
 * THE SINGLE RESOLVER for both Quick Generate and Create Export.
 *
 * Resolution order (strict):
 *   1. Explicit profileKey → PROFILE_REGISTRY lookup
 *   2. Federal detection (court name / court type patterns)
 *   3. County-specific match (e.g. Fort Bend 387th)
 *   4. State default
 *   5. Global default (us-default)
 *
 * Returns the resolved profile + resolution metadata for observability.
 */

import type {
  JurisdictionProfile,
  ProfileResolutionMeta,
  ProfileResolutionSource,
  ResolverSettingsInput,
} from './types';

import {
  PROFILE_REGISTRY,
  US_DEFAULT_PROFILE,
  TX_DEFAULT_PROFILE,
  TX_FORT_BEND_387TH_PROFILE,
  FL_DEFAULT_PROFILE,
  CA_DEFAULT_PROFILE,
  FEDERAL_DEFAULT_PROFILE,
} from './profiles/registry';

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

export type ResolvedProfileResult = {
  profile: JurisdictionProfile;
  meta: ProfileResolutionMeta;
};

/**
 * Resolve the best-matching jurisdiction profile from settings.
 *
 * Deterministic: same input always produces same output.
 *
 * @param settings - Court settings for matching
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
        profile: explicit,
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
      profile: US_DEFAULT_PROFILE,
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
    courtName.includes('united states district court') ||
    courtName.includes('u.s. district court') ||
    courtName.includes('us district court') ||
    /\busdc\b/.test(courtName) ||
    /\bu\.?s\.?d\.?c\.?\b/.test(courtName);

  if (isFederal) {
    return result(FEDERAL_DEFAULT_PROFILE, 'court_exact_match');
  }

  // ── 3. County-specific ──
  if (state === 'texas' && county === 'fort bend') {
    if (/\b387(th)?\b/.test(venue)) {
      return result(TX_FORT_BEND_387TH_PROFILE, 'court_exact_match');
    }
  }

  // ── 4. State defaults ──
  if (state === 'texas') {
    return result(TX_DEFAULT_PROFILE, county ? 'state_fallback_unmatched_county' : 'state_default');
  }
  if (state === 'florida') {
    return result(FL_DEFAULT_PROFILE, county ? 'state_fallback_unmatched_county' : 'state_default');
  }
  if (state === 'california') {
    return result(CA_DEFAULT_PROFILE, county ? 'state_fallback_unmatched_county' : 'state_default');
  }

  // ── 5. Global default ──
  return result(US_DEFAULT_PROFILE, 'global_default');
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
    profile,
    meta: { profileKey: profile.key, source },
  };
}

// Re-export the registry for explicit key lookups
export { PROFILE_REGISTRY };
