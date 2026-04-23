/**
 * Shared Jurisdiction Profile Regression Tests
 *
 * Validates the unified profile system:
 *   - Registry completeness
 *   - Resolver correctness (profileKey, state, county, federal)
 *   - Profile assertions (QG + Export narrowing)
 *   - Override application (V2 typed + legacy coercion)
 *   - Override normalization (range checks, whitelist, invalid rejection)
 */

import { describe, it, expect } from 'vitest';
import { PROFILE_REGISTRY } from '@/lib/jurisdiction/profiles/registry';
import { resolveSharedJurisdictionProfile } from '@/lib/jurisdiction/resolveSharedJurisdictionProfile';
import { assertQuickGenerateProfile, assertExportProfile } from '@/lib/jurisdiction/assertProfileForPipeline';
import { applyFormattingOverrides } from '@/lib/jurisdiction/applyFormattingOverrides';
import {
  normalizeFormattingOverrides,
  coerceLegacyFormattingOverrides,
  resolveEffectiveOverrides,
  isFormattingOverridesV2,
} from '@/lib/jurisdiction/overrides';

// ═══════════════════════════════════════════════════════════════
// Registry Completeness
// ═══════════════════════════════════════════════════════════════

describe('shared profile registry', () => {
  it('contains all expected profiles', () => {
    const keys = [...PROFILE_REGISTRY.keys()];
    expect(keys).toContain('us-default');
    expect(keys).toContain('tx-default');
    expect(keys).toContain('tx-fort-bend-387th');
    expect(keys).toContain('fl-default');
    expect(keys).toContain('ca-default');
    expect(keys).toContain('federal-default');
  });

  it('every registry profile has required shared fields', () => {
    for (const [key, profile] of PROFILE_REGISTRY) {
      expect(profile.key).toBe(key);
      expect(profile.version).toBeTruthy();
      expect(profile.name).toBeTruthy();
      expect(profile.page).toBeDefined();
      expect(profile.page.size).toBeTruthy();
      expect(profile.typography).toBeDefined();
      expect(profile.pdf).toBeDefined();
    }
  });

  it('every registry profile passes QG assertion', () => {
    for (const [, profile] of PROFILE_REGISTRY) {
      expect(() => assertQuickGenerateProfile(profile)).not.toThrow();
    }
  });

  it('every registry profile passes Export assertion', () => {
    for (const [, profile] of PROFILE_REGISTRY) {
      expect(() => assertExportProfile(profile)).not.toThrow();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Resolver Correctness
// ═══════════════════════════════════════════════════════════════

describe('shared resolver — resolution order', () => {
  it('resolves by explicit profileKey (highest priority)', () => {
    const { profile, meta } = resolveSharedJurisdictionProfile({
      profileKey: 'ca-default',
      state: 'Texas', // should be ignored when profileKey is set
    });
    expect(profile.key).toBe('ca-default');
    expect(meta.source).toBe('explicit_profile_key');
  });

  it('warns and falls through on invalid profileKey', () => {
    const { profile, meta } = resolveSharedJurisdictionProfile({
      profileKey: 'nonexistent',
      state: 'Texas',
    });
    expect(profile.key).toBe('tx-default');
    expect(meta.source).toBe('state_default');
  });

  it('detects federal courts by name', () => {
    const { profile, meta } = resolveSharedJurisdictionProfile({
      courtName: 'United States District Court',
    });
    expect(profile.key).toBe('federal-default');
    expect(meta.source).toBe('court_exact_match');
  });

  it('detects federal courts by courtType', () => {
    const { profile } = resolveSharedJurisdictionProfile({
      courtType: 'federal',
    });
    expect(profile.key).toBe('federal-default');
  });

  it('resolves Fort Bend 387th exact match', () => {
    const { profile, meta } = resolveSharedJurisdictionProfile({
      state: 'Texas',
      county: 'Fort Bend',
      courtName: '387th Judicial District Court',
    });
    expect(profile.key).toBe('tx-fort-bend-387th');
    expect(meta.source).toBe('court_exact_match');
  });

  it('falls back to tx-default for unmatched Fort Bend court', () => {
    const { profile, meta } = resolveSharedJurisdictionProfile({
      state: 'Texas',
      county: 'Fort Bend',
    });
    expect(profile.key).toBe('tx-default');
    expect(meta.source).toBe('state_fallback_unmatched_county');
  });

  it('resolves state defaults', () => {
    expect(resolveSharedJurisdictionProfile({ state: 'Texas' }).profile.key).toBe('tx-default');
    expect(resolveSharedJurisdictionProfile({ state: 'Florida' }).profile.key).toBe('fl-default');
    expect(resolveSharedJurisdictionProfile({ state: 'California' }).profile.key).toBe('ca-default');
  });

  it('returns global default for null/undefined/empty', () => {
    expect(resolveSharedJurisdictionProfile(null).profile.key).toBe('us-default');
    expect(resolveSharedJurisdictionProfile(undefined).profile.key).toBe('us-default');
    expect(resolveSharedJurisdictionProfile({}).profile.key).toBe('us-default');
  });
});

// ═══════════════════════════════════════════════════════════════
// V2 Override Normalization
// ═══════════════════════════════════════════════════════════════

describe('formatting overrides — normalization', () => {
  it('normalizes valid V2 overrides', () => {
    const result = normalizeFormattingOverrides({
      pageSize: 'LEGAL',
      defaultFontSizePt: 14,
      lineSpacing: 2,
      batesEnabled: true,
    });
    expect(result).toEqual({
      pageSize: 'LEGAL',
      defaultFontSizePt: 14,
      lineSpacing: 2,
      batesEnabled: true,
    });
  });

  it('rejects out-of-range font sizes', () => {
    const result = normalizeFormattingOverrides({
      defaultFontSizePt: 100, // > 72
    });
    expect(result).toBeUndefined();
  });

  it('rejects invalid page sizes', () => {
    const result = normalizeFormattingOverrides({
      pageSize: 'TABLOID', // not in whitelist
    });
    expect(result).toBeUndefined();
  });

  it('drops unknown keys silently', () => {
    const result = normalizeFormattingOverrides({
      unknownField: 'whatever',
      defaultFont: 'Arial',
    });
    expect(result).toEqual({ defaultFont: 'Arial' });
  });
});

// ═══════════════════════════════════════════════════════════════
// Legacy Coercion
// ═══════════════════════════════════════════════════════════════

describe('formatting overrides — legacy coercion', () => {
  it('coerces legacy fontSize to defaultFontSizePt', () => {
    const result = coerceLegacyFormattingOverrides({ fontSize: 14 });
    expect(result?.defaultFontSizePt).toBe(14);
  });

  it('coerces legacy fontFamily to defaultFont', () => {
    const result = coerceLegacyFormattingOverrides({ fontFamily: 'Courier New' });
    expect(result?.defaultFont).toBe('Courier New');
  });

  it('coerces legacy margins from inches to pt', () => {
    const result = coerceLegacyFormattingOverrides({
      marginTop: 1.25,
      marginRight: 1,
      marginBottom: 1,
      marginLeft: 1,
    });
    expect(result?.pageMarginsPt?.top).toBe(90); // 1.25 * 72
    expect(result?.pageMarginsPt?.right).toBe(72);
  });
});

// ═══════════════════════════════════════════════════════════════
// Effective Override Resolution
// ═══════════════════════════════════════════════════════════════

describe('resolveEffectiveOverrides', () => {
  it('prefers V2 over legacy', () => {
    const { overrides, source } = resolveEffectiveOverrides(
      { defaultFontSizePt: 14 },
      { fontSize: 12 },
    );
    expect(overrides?.defaultFontSizePt).toBe(14);
    expect(source).toBe('v2');
  });

  it('falls back to legacy when V2 is null', () => {
    const { overrides, source } = resolveEffectiveOverrides(
      null,
      { fontSize: 12 },
    );
    expect(overrides?.defaultFontSizePt).toBe(12);
    expect(source).toBe('legacy_coerced');
  });

  it('returns none when both are empty', () => {
    const { source } = resolveEffectiveOverrides(null, null);
    expect(source).toBe('none');
  });
});

// ═══════════════════════════════════════════════════════════════
// Override Application
// ═══════════════════════════════════════════════════════════════

describe('applyFormattingOverrides', () => {
  it('does not mutate the source profile', () => {
    const { profile: base } = resolveSharedJurisdictionProfile({ state: 'Texas' });
    const originalFont = base.typography.fontFamily;

    const modified = applyFormattingOverrides(base, { defaultFont: 'Courier New' });

    expect(base.typography.fontFamily).toBe(originalFont);
    expect(modified.typography.fontFamily).toContain('Courier New');
  });

  it('returns base profile when overrides are undefined', () => {
    const { profile: base } = resolveSharedJurisdictionProfile(null);
    const result = applyFormattingOverrides(base, undefined);
    expect(result).toBe(base);
  });

  it('applies page size override', () => {
    const { profile: base } = resolveSharedJurisdictionProfile(null);
    const result = applyFormattingOverrides(base, { pageSize: 'LEGAL' });
    expect(result.page.size).toBe('Legal');
    expect(result.page.heightIn).toBe(14);
  });

  it('adjusts lineHeight when fontSize changes', () => {
    const { profile: base } = resolveSharedJurisdictionProfile(null);
    const result = applyFormattingOverrides(base, { defaultFontSizePt: 14 });
    expect(result.typography.fontSizePt).toBe(14);
    // Line height should be proportionally adjusted
    expect(result.typography.lineHeightPt).toBeGreaterThan(base.typography.lineHeightPt);
  });
});

// ═══════════════════════════════════════════════════════════════
// Type Guard
// ═══════════════════════════════════════════════════════════════

describe('isFormattingOverridesV2', () => {
  it('returns true for V2 objects', () => {
    expect(isFormattingOverridesV2({ defaultFontSizePt: 14 })).toBe(true);
    expect(isFormattingOverridesV2({ pageSize: 'LETTER' })).toBe(true);
  });

  it('returns false for non-objects', () => {
    expect(isFormattingOverridesV2(null)).toBe(false);
    expect(isFormattingOverridesV2('string')).toBe(false);
    expect(isFormattingOverridesV2(42)).toBe(false);
  });

  it('returns false for objects without V2 keys', () => {
    expect(isFormattingOverridesV2({ fontSize: 14 })).toBe(false);
  });

  it('returns false for empty objects', () => {
    expect(isFormattingOverridesV2({})).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Override Matrix (Expanded Edge Cases)
// ═══════════════════════════════════════════════════════════════

describe('override matrix — edge cases', () => {
  it('no overrides leaves profile untouched', () => {
    const { profile: base } = resolveSharedJurisdictionProfile(null);
    const result = applyFormattingOverrides(base, undefined);
    expect(result).toBe(base);
  });

  it('valid V2 applies cleanly', () => {
    const { profile: base } = resolveSharedJurisdictionProfile(null);
    const result = applyFormattingOverrides(base, {
      defaultFontSizePt: 14,
      defaultFont: 'Courier New',
      lineSpacing: 2,
    });
    expect(result.typography.fontSizePt).toBe(14);
    expect(result.typography.fontFamily).toContain('Courier New');
  });

  it('malformed V2 is safely dropped', () => {
    const result = normalizeFormattingOverrides({
      defaultFontSizePt: -1,
      pageSize: 'TABLOID',
    });
    // All fields invalid, should return undefined
    expect(result).toBeUndefined();
  });

  it('legacy only coerces cleanly', () => {
    const { overrides, source } = resolveEffectiveOverrides(
      null,
      { fontSize: 12, fontFamily: 'Georgia' },
    );
    expect(source).toBe('legacy_coerced');
    expect(overrides?.defaultFontSizePt).toBe(12);
    expect(overrides?.defaultFont).toBe('Georgia');
  });

  it('V2 overrides legacy when both present', () => {
    const { overrides, source } = resolveEffectiveOverrides(
      { defaultFontSizePt: 16, defaultFont: 'Arial' },
      { fontSize: 12, fontFamily: 'Courier' },
    );
    expect(source).toBe('v2');
    expect(overrides?.defaultFontSizePt).toBe(16);
    expect(overrides?.defaultFont).toBe('Arial');
  });

  it('unknown keys are silently ignored', () => {
    const result = normalizeFormattingOverrides({
      fakeKey: 'value',
      anotherFake: 42,
      defaultFont: 'Times New Roman',
    });
    expect(result).toEqual({ defaultFont: 'Times New Roman' });
    expect((result as Record<string, unknown>)?.fakeKey).toBeUndefined();
  });

  it('out-of-range values are rejected', () => {
    const resultFontTooLarge = normalizeFormattingOverrides({ defaultFontSizePt: 100 });
    expect(resultFontTooLarge).toBeUndefined();

    const resultFontTooSmall = normalizeFormattingOverrides({ defaultFontSizePt: 3 });
    expect(resultFontTooSmall).toBeUndefined();
  });
});
