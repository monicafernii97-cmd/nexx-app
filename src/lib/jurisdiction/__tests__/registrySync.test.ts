/**
 * Registry Sync Test
 *
 * Validates that the Convex VALID_PROFILE_KEYS whitelist (convex/courtSettings.ts)
 * stays in sync with the shared PROFILE_REGISTRY (src/lib/jurisdiction/profiles/registry.ts).
 *
 * This is the safety net that catches drift when a new profile is added to one
 * location but not the other. Both sides must be updated together.
 *
 * Note: Convex files cannot be directly imported in Vitest (they use the Convex
 * runtime), so the whitelist is mirrored here as a sync assertion target.
 * The Convex source file is also read at test time to verify the mirror is current.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PROFILE_REGISTRY, STATE_PROFILE_MAP } from '@/lib/jurisdiction/profiles/registry';

/**
 * Mirror of the VALID_PROFILE_KEYS set from convex/courtSettings.ts.
 * This is intentionally duplicated here as a sync assertion target.
 *
 * ⚠️  When adding a new profile:
 *   1. Add the key to src/lib/jurisdiction/profiles/registry.ts
 *   2. Add the key to convex/courtSettings.ts (VALID_PROFILE_KEYS)
 *   3. Add the key here — this test will fail if any location drifts.
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

  it('convex/courtSettings.ts VALID_PROFILE_KEYS contains every registry key', () => {
    // Read the actual Convex file and extract just the VALID_PROFILE_KEYS
    // initializer block — avoids false positives from comments or unrelated constants.
    const convexPath = resolve(__dirname, '../../../../convex/courtSettings.ts');
    const source = readFileSync(convexPath, 'utf-8');

    const validKeysBlock = source.match(
      /const\s+VALID_PROFILE_KEYS\s*=\s*new\s+Set\(\s*\[([\s\S]*?)\]\s*\)/,
    )?.[1];

    expect(
      validKeysBlock,
      'Could not locate VALID_PROFILE_KEYS in convex/courtSettings.ts',
    ).toBeTruthy();

    const convexKeys = new Set(
      [...validKeysBlock!.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]),
    );

    for (const key of PROFILE_REGISTRY.keys()) {
      expect(
        convexKeys.has(key),
        `Registry key "${key}" missing from convex/courtSettings.ts VALID_PROFILE_KEYS`,
      ).toBe(true);
    }

    // Reciprocal: catch stale extra keys in Convex that were removed from registry
    expect(convexKeys.size).toBe(PROFILE_REGISTRY.size);
    for (const key of convexKeys) {
      expect(
        PROFILE_REGISTRY.has(key),
        `convex/courtSettings.ts VALID_PROFILE_KEYS contains stale key "${key}"`,
      ).toBe(true);
    }
  });
});
