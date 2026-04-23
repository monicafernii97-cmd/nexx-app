/**
 * Enriched State Profile Regression Tests
 *
 * Validates that the 5 priority enriched state profiles (IL, OH, PA, NJ, GA):
 * - Have correct identity fields (key, state, scope)
 * - Resolve correctly through the layered pipeline
 * - Are registered in the shared PROFILE_REGISTRY
 * - Have accuracy metadata (sourceNotes) when not thin_default
 * - Override caption rules correctly
 */

import { describe, expect, it } from 'vitest';
import { PROFILE_REGISTRY, STATE_PROFILE_MAP } from '../profiles/registry';
import { resolveSharedJurisdictionProfile } from '../resolveSharedJurisdictionProfile';

// ═══════════════════════════════════════════════════════════════
// Test Matrix
// ═══════════════════════════════════════════════════════════════

const ENRICHED_STATES = [
  { code: 'IL', name: 'Illinois', expectedKey: 'il-default', causeLabel: 'Case No.' },
  { code: 'OH', name: 'Ohio', expectedKey: 'oh-default', causeLabel: 'Case No.' },
  { code: 'PA', name: 'Pennsylvania', expectedKey: 'pa-default', causeLabel: 'No.' },
  { code: 'NJ', name: 'New Jersey', expectedKey: 'nj-default', causeLabel: 'Docket No.' },
  { code: 'GA', name: 'Georgia', expectedKey: 'ga-default', causeLabel: 'Civil Action File No.' },
] as const;

// ═══════════════════════════════════════════════════════════════
// Identity & Schema Tests
// ═══════════════════════════════════════════════════════════════

describe('enriched state profiles — identity', () => {
  for (const { code, name, expectedKey } of ENRICHED_STATES) {
    describe(name, () => {
      it(`has correct profile key: ${expectedKey}`, () => {
        const profile = STATE_PROFILE_MAP[code];
        expect(profile).toBeDefined();
        expect(profile!.key).toBe(expectedKey);
      });

      it(`has correct state name: ${name}`, () => {
        const profile = STATE_PROFILE_MAP[code];
        expect(profile!.state).toBe(name);
      });

      it(`has correct scope.state: ${code}`, () => {
        const profile = STATE_PROFILE_MAP[code];
        expect(profile!.scope?.state).toBe(code);
      });

      it('is registered in PROFILE_REGISTRY', () => {
        expect(PROFILE_REGISTRY.has(expectedKey)).toBe(true);
      });
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// Accuracy Metadata Tests
// ═══════════════════════════════════════════════════════════════

describe('enriched state profiles — accuracy metadata', () => {
  for (const { code: _code, name, expectedKey } of ENRICHED_STATES) {
    describe(name, () => {
      const profile = PROFILE_REGISTRY.get(expectedKey);

      it('has accuracyStatus set', () => {
        expect(profile?.accuracyStatus).toBeDefined();
      });

      it('enriched profiles have sourceNotes', () => {
        if (profile?.accuracyStatus !== 'thin_default') {
          expect(profile?.sourceNotes?.length).toBeGreaterThan(0);
        }
      });

      it('enriched sourceNotes have required fields', () => {
        if (
          profile?.accuracyStatus !== 'thin_default' &&
          profile?.sourceNotes?.length
        ) {
          for (const note of profile.sourceNotes) {
            expect(note.label).toBeDefined();
            expect(note.label.length).toBeGreaterThan(0);
            expect(note.reviewedAt).toBeDefined();
          }
        }
      });
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// Caption Override Tests
// ═══════════════════════════════════════════════════════════════

describe('enriched state profiles — caption overrides', () => {
  for (const { code, name, causeLabel } of ENRICHED_STATES) {
    it(`${name} uses cause label "${causeLabel}"`, () => {
      const profile = STATE_PROFILE_MAP[code];
      expect(profile?.caption?.causeLabel).toBe(causeLabel);
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// Resolver Integration Tests
// ═══════════════════════════════════════════════════════════════

describe('enriched state profiles — resolver integration', () => {
  for (const { code, name, expectedKey } of ENRICHED_STATES) {
    it(`resolves ${name} state default correctly`, () => {
      const result = resolveSharedJurisdictionProfile({
        state: code,
      });
      expect(result.profile.key).toBe(expectedKey);
      expect(result.meta.profileKey).toBe(expectedKey);
    });

    it(`resolves ${name} + family court with correct profile source`, () => {
      const result = resolveSharedJurisdictionProfile({
        state: code,
        courtType: 'family_court',
      });
      // Court type override should be applied; profile key may contain family court info
      expect(result.profile.scope?.state).toBe(code);
      expect(result.meta.profileKey).toBeDefined();
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// Global Accuracy Enforcement
// ═══════════════════════════════════════════════════════════════

describe('accuracy metadata enforcement — all profiles', () => {
  it('enriched_verified profiles must have sourceNotes', () => {
    for (const [key, profile] of PROFILE_REGISTRY.entries()) {
      if (profile.accuracyStatus === 'enriched_verified') {
        expect(
          (profile.sourceNotes ?? []).length,
          `Profile "${key}" is enriched_verified but has no sourceNotes`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('enriched_pending_review profiles must have sourceNotes', () => {
    for (const [key, profile] of PROFILE_REGISTRY.entries()) {
      if (profile.accuracyStatus === 'enriched_pending_review') {
        expect(
          (profile.sourceNotes ?? []).length,
          `Profile "${key}" is enriched_pending_review but has no sourceNotes`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
