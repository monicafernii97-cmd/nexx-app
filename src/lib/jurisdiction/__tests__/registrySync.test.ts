/**
 * Registry Sync Test
 *
 * Validates that the Convex VALID_PROFILE_KEYS whitelist stays
 * in sync with the shared PROFILE_REGISTRY. Catches drift when
 * a new profile is added to one but not the other.
 */

import { describe, it, expect } from 'vitest';
import { PROFILE_REGISTRY, STATE_PROFILE_MAP } from '@/lib/jurisdiction/profiles/registry';

/**
 * Mirror of the VALID_PROFILE_KEYS set from convex/courtSettings.ts.
 * This is intentionally duplicated here as a sync assertion target.
 * If the Convex whitelist changes, this test must be updated too.
 */
const CONVEX_VALID_PROFILE_KEYS = new Set([
  // National + Federal
  'us-default', 'federal-default',
  // State defaults (all 50)
  'al-default', 'ak-default', 'az-default', 'ar-default',
  'ca-default', 'co-default', 'ct-default', 'de-default',
  'fl-default', 'ga-default', 'hi-default', 'id-default',
  'il-default', 'in-default', 'ia-default', 'ks-default',
  'ky-default', 'la-default', 'me-default', 'md-default',
  'ma-default', 'mi-default', 'mn-default', 'ms-default',
  'mo-default', 'mt-default', 'ne-default', 'nv-default',
  'nh-default', 'nj-default', 'nm-default', 'ny-default',
  'nc-default', 'nd-default', 'oh-default', 'ok-default',
  'or-default', 'pa-default', 'ri-default', 'sc-default',
  'sd-default', 'tn-default', 'tx-default', 'ut-default',
  'vt-default', 'va-default', 'wa-default', 'wv-default',
  'wi-default', 'wy-default',
  // Specific courts
  'tx-fort-bend-387th', 'ca-los-angeles-superior', 'fl-miami-dade-family',
]);

describe('registry sync — Convex vs PROFILE_REGISTRY', () => {
  it('every PROFILE_REGISTRY key exists in CONVEX_VALID_PROFILE_KEYS', () => {
    for (const key of PROFILE_REGISTRY.keys()) {
      expect(
        CONVEX_VALID_PROFILE_KEYS.has(key),
        `Registry key "${key}" missing from Convex VALID_PROFILE_KEYS whitelist`,
      ).toBe(true);
    }
  });

  it('every CONVEX_VALID_PROFILE_KEYS entry exists in PROFILE_REGISTRY', () => {
    for (const key of CONVEX_VALID_PROFILE_KEYS) {
      expect(
        PROFILE_REGISTRY.has(key),
        `Convex key "${key}" missing from PROFILE_REGISTRY`,
      ).toBe(true);
    }
  });

  it('key counts match exactly', () => {
    expect(PROFILE_REGISTRY.size).toBe(CONVEX_VALID_PROFILE_KEYS.size);
  });

  it('STATE_PROFILE_MAP has exactly 50 entries', () => {
    expect(Object.keys(STATE_PROFILE_MAP).length).toBe(50);
  });

  it('every state profile key follows xx-default pattern', () => {
    for (const [code, profile] of Object.entries(STATE_PROFILE_MAP)) {
      expect(profile.key).toBe(`${code.toLowerCase()}-default`);
    }
  });
});
