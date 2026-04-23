/**
 * Profile Unification Regression Tests
 *
 * Validates that Quick Generate and Create Export pipelines resolve
 * identical shared profiles for the same jurisdiction input, ensuring
 * cross-pipeline consistency.
 */

import { describe, it, expect } from 'vitest';
import { resolveSharedJurisdictionProfile } from '@/lib/jurisdiction/resolveSharedJurisdictionProfile';
import { assertQuickGenerateProfile, assertExportProfile } from '@/lib/jurisdiction/assertProfileForPipeline';

describe('profile unification — cross-pipeline consistency', () => {
  const JURISDICTION_INPUTS = [
    {
      label: 'Texas default',
      input: { state: 'Texas' },
      expectedKey: 'tx-default',
    },
    {
      label: 'Texas Fort Bend 387th',
      input: { state: 'Texas', county: 'Fort Bend', courtName: '387th District Court' },
      expectedKey: 'tx-fort-bend-387th',
    },
    {
      label: 'Florida default',
      input: { state: 'Florida' },
      expectedKey: 'fl-default',
    },
    {
      label: 'California default',
      input: { state: 'California' },
      expectedKey: 'ca-default',
    },
    {
      label: 'Federal court',
      input: { courtName: 'United States District Court for the Southern District of Texas' },
      expectedKey: 'federal-default',
    },
    {
      label: 'No input (global default)',
      input: {},
      expectedKey: 'us-default',
    },
  ];

  for (const { label, input, expectedKey } of JURISDICTION_INPUTS) {
    it(`${label} resolves to "${expectedKey}" from shared resolver`, () => {
      const { profile, meta } = resolveSharedJurisdictionProfile(input);
      expect(profile.key).toBe(expectedKey);
      expect(meta.profileKey).toBe(expectedKey);
    });

    it(`${label} profile passes QG assertion`, () => {
      const { profile } = resolveSharedJurisdictionProfile(input);
      expect(() => assertQuickGenerateProfile(profile)).not.toThrow();
    });

    it(`${label} profile passes Export assertion`, () => {
      const { profile } = resolveSharedJurisdictionProfile(input);
      expect(() => assertExportProfile(profile)).not.toThrow();
    });
  }

  it('explicit profileKey overrides jurisdiction detection', () => {
    const { profile, meta } = resolveSharedJurisdictionProfile({
      state: 'Florida',
      profileKey: 'federal-default',
    });
    expect(profile.key).toBe('federal-default');
    expect(meta.source).toBe('explicit_profile_key');
  });

  it('deterministic — same input yields same result', () => {
    const input = { state: 'Texas', county: 'Fort Bend', courtName: '387th District Court' };
    const a = resolveSharedJurisdictionProfile(input);
    const b = resolveSharedJurisdictionProfile(input);
    expect(a.profile.key).toBe(b.profile.key);
    expect(a.meta.source).toBe(b.meta.source);
    expect(a.profile.version).toBe(b.profile.version);
  });
});
