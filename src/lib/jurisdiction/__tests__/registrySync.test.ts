/**
 * Registry Sync Test
 *
 * Validates that the Convex VALID_PROFILE_KEYS whitelist stays
 * in sync with the shared PROFILE_REGISTRY. Catches drift when
 * a new profile is added to one but not the other.
 */

import { describe, it, expect } from 'vitest';
import { PROFILE_REGISTRY } from '@/lib/jurisdiction/profiles/registry';

/**
 * Mirror of the VALID_PROFILE_KEYS set from convex/courtSettings.ts.
 * This is intentionally duplicated here as a sync assertion target.
 * If the Convex whitelist changes, this test must be updated too.
 */
const CONVEX_VALID_PROFILE_KEYS = new Set([
  'us-default', 'tx-default', 'tx-fort-bend-387th',
  'fl-default', 'ca-default', 'federal-default',
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
});
