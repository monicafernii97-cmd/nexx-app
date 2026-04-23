/**
 * Layered Profile Resolution — Regression Tests
 *
 * Validates the deterministic layered merge:
 *   US default → state → court type → specific court → user → case → document
 *
 * Tests cover:
 *   - All 50 states resolve correctly
 *   - Court-type overrides apply
 *   - Specific court overrides win over state defaults
 *   - Multi-layer merge correctness
 *   - Caption style propagation
 *   - Default value preservation
 *   - Backward compatibility
 *   - courtDocument ↔ sections normalization
 */

import { describe, it, expect } from 'vitest';

import {
  resolveSharedJurisdictionProfile,
  resolveLayeredProfile,
} from '@/lib/jurisdiction/resolveSharedJurisdictionProfile';

import {
  STATE_PROFILE_MAP,
  PROFILE_REGISTRY,
  US_DEFAULT_PROFILE,
  TX_DEFAULT_PROFILE,
} from '@/lib/jurisdiction/profiles/registry';

import type { JurisdictionProfile } from '@/lib/jurisdiction/types';

import { mergeJurisdictionProfiles } from '@/lib/jurisdiction/mergeJurisdictionProfiles';
import { normalizeCourtDocumentSections } from '@/lib/jurisdiction/types';

// ═══════════════════════════════════════════════════════════════
// 1. All 50 States Resolve
// ═══════════════════════════════════════════════════════════════

describe('50-state resolution', () => {
  const stateCodes = Object.keys(STATE_PROFILE_MAP);

  it('STATE_PROFILE_MAP contains exactly 50 entries', () => {
    expect(stateCodes.length).toBe(50);
  });

  it.each(stateCodes)('resolves %s via 2-letter code', (code) => {
    const { profile, meta } = resolveLayeredProfile({ state: code });
    expect(profile.key).toBe(`${code.toLowerCase()}-default`);
    expect(meta.source).toBe('state_default');
  });

  it('resolves Texas by full name', () => {
    const { profile } = resolveLayeredProfile({ state: 'Texas' });
    expect(profile.key).toBe('tx-default');
  });

  it('resolves California by full name', () => {
    const { profile } = resolveLayeredProfile({ state: 'California' });
    expect(profile.key).toBe('ca-default');
  });

  it('resolves New York by full name', () => {
    const { profile } = resolveLayeredProfile({ state: 'New York' });
    expect(profile.key).toBe('ny-default');
  });

  it('unknown state falls back to US default', () => {
    const { profile, meta } = resolveLayeredProfile({ state: 'Narnia' });
    expect(profile.key).toBe('us-default');
    expect(meta.source).toBe('global_default');
  });

  it('empty input returns US default', () => {
    const { profile, meta } = resolveLayeredProfile({});
    expect(profile.key).toBe('us-default');
    expect(meta.source).toBe('global_default');
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Caption Style Propagation
// ═══════════════════════════════════════════════════════════════

describe('caption style propagation', () => {
  it('TX uses texas_pleading caption', () => {
    const { profile } = resolveLayeredProfile({ state: 'TX' });
    expect(profile.caption?.style).toBe('texas_pleading');
    expect(profile.caption?.causeLabel).toBe('CAUSE NO.');
    expect(profile.caption?.useThreeColumnTable).toBe(true);
  });

  it('NY uses INDEX NO. cause label', () => {
    const { profile } = resolveLayeredProfile({ state: 'NY' });
    expect(profile.caption?.causeLabel).toBe('INDEX NO.');
  });

  it('federal detection overrides caption to federal_caption', () => {
    const { profile } = resolveLayeredProfile({
      courtName: 'United States District Court',
    });
    expect(profile.caption?.style).toBe('federal_caption');
    expect(profile.caption?.causeLabel).toBe('CIVIL ACTION NO.');
  });

  it('AL inherits US default caption', () => {
    const { profile } = resolveLayeredProfile({ state: 'AL' });
    expect(profile.caption?.style).toBe('generic_state_caption');
    expect(profile.caption?.causeLabel).toBe('CASE NO.');
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Court-Type Override Merge
// ═══════════════════════════════════════════════════════════════

describe('court-type override merge', () => {
  it('family_court override applies on top of state profile', () => {
    const { profile } = resolveLayeredProfile({
      state: 'OH',
      courtType: 'family_court',
    });
    expect(profile.sections?.prayerHeadingRequired).toBe(true);
    expect(profile.exhibit?.coverPageRequired).toBe(true);
  });

  it('federal_district override applies Bates numbering', () => {
    const { profile } = resolveLayeredProfile({
      state: 'TX',
      courtType: 'federal_district',
    });
    expect(profile.exhibit?.batesEnabledDefault).toBe(true);
    expect(profile.exhibit?.labelStyleDefault).toBe('numeric');
  });

  it('probate_court override applies in_re_caption', () => {
    const { profile } = resolveLayeredProfile({
      state: 'FL',
      courtType: 'probate_court',
    });
    expect(profile.caption?.style).toBe('in_re_caption');
  });

  it('unknown court type does not override', () => {
    const { profile } = resolveLayeredProfile({
      state: 'TX',
      courtType: 'other',
    });
    // Should still have TX defaults
    expect(profile.caption?.style).toBe('texas_pleading');
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Specific Court Override
// ═══════════════════════════════════════════════════════════════

describe('specific court override', () => {
  it('TX Fort Bend 387th resolves via legacy resolver', () => {
    const { profile, meta } = resolveSharedJurisdictionProfile({
      state: 'Texas',
      county: 'Fort Bend',
      courtName: '387th',
    });
    expect(profile.key).toBe('tx-fort-bend-387th');
    expect(meta.source).toBe('court_exact_match');
  });

  it('explicit profileKey overrides everything', () => {
    const { profile, meta } = resolveSharedJurisdictionProfile({
      profileKey: 'tx-fort-bend-387th',
      state: 'California', // should be ignored
    });
    expect(profile.key).toBe('tx-fort-bend-387th');
    expect(meta.source).toBe('explicit_profile_key');
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Multi-Layer Merge
// ═══════════════════════════════════════════════════════════════

describe('multi-layer merge', () => {
  it('user overrides win over state defaults', () => {
    const { profile } = resolveLayeredProfile({
      state: 'TX',
      userOverrides: {
        typography: {
          fontFamily: '"Courier New", monospace',
          fontSizePt: 14,
          lineHeightPt: 28,
          bodyAlign: 'left',
          headingBold: true,
          uppercaseHeadings: true,
          uppercaseTitle: true,
          uppercaseCaption: true,
        },
      },
    });
    expect(profile.typography.fontFamily).toBe('"Courier New", monospace');
    expect(profile.typography.fontSizePt).toBe(14);
  });

  it('document overrides win over case overrides', () => {
    const { profile } = resolveLayeredProfile({
      state: 'TX',
      caseOverrides: {
        typography: {
          ...TX_DEFAULT_PROFILE.typography,
          fontSizePt: 14,
        },
      },
      documentOverrides: {
        typography: {
          ...TX_DEFAULT_PROFILE.typography,
          fontSizePt: 11,
        },
      },
    });
    expect(profile.typography.fontSizePt).toBe(11);
  });

  it('page margins merge independently', () => {
    const { profile } = resolveLayeredProfile({
      state: 'TX',
      userOverrides: {
        page: {
          ...TX_DEFAULT_PROFILE.page,
          marginsPt: { top: 90, right: 78, bottom: 72, left: 78 },
        },
      },
    });
    expect(profile.page.marginsPt.top).toBe(90);
    // Other margins preserved from override
    expect(profile.page.marginsPt.right).toBe(78);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Default Value Preservation
// ═══════════════════════════════════════════════════════════════

describe('default value preservation', () => {
  it('thin state profiles preserve all US default blocks', () => {
    // AL is a thin_default state — inherits everything from US_DEFAULT_PROFILE
    const alProfile = STATE_PROFILE_MAP['AL'];
    expect(alProfile.page).toEqual(US_DEFAULT_PROFILE.page);
    expect(alProfile.typography).toEqual(US_DEFAULT_PROFILE.typography);
    expect(alProfile.pdf).toEqual(US_DEFAULT_PROFILE.pdf);
    expect(alProfile.caption).toEqual(US_DEFAULT_PROFILE.caption);
    expect(alProfile.exhibit).toEqual(US_DEFAULT_PROFILE.exhibit);
  });

  it('TX overrides only what differs', () => {
    expect(TX_DEFAULT_PROFILE.typography.bodyAlign).toBe('justify');
    expect(TX_DEFAULT_PROFILE.typography.fontFamily).toBe(US_DEFAULT_PROFILE.typography.fontFamily);
    expect(TX_DEFAULT_PROFILE.pdf).toEqual(US_DEFAULT_PROFILE.pdf);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. courtDocument ↔ sections Normalization
// ═══════════════════════════════════════════════════════════════

describe('courtDocument ↔ sections normalization', () => {
  it('normalizes sections to courtDocument when both missing', () => {
    const profile = normalizeCourtDocumentSections({
      ...US_DEFAULT_PROFILE,
      sections: undefined,
      courtDocument: undefined,
    });
    expect(profile.sections).toBeUndefined();
    expect(profile.courtDocument).toBeUndefined();
  });

  it('copies sections to courtDocument when courtDocument missing', () => {
    const profile = normalizeCourtDocumentSections({
      ...US_DEFAULT_PROFILE,
      courtDocument: undefined,
    });
    expect(profile.courtDocument).toEqual(profile.sections);
  });

  it('copies courtDocument to sections when sections missing', () => {
    const cd = {
      prayerHeadingRequired: true,
      certificateSeparatePage: false,
      signatureKeepTogether: true,
      verificationKeepTogether: false,
    };
    const profile = normalizeCourtDocumentSections({
      ...US_DEFAULT_PROFILE,
      sections: undefined,
      courtDocument: cd,
    });
    expect(profile.sections).toEqual(cd);
    expect(profile.courtDocument).toEqual(cd);
  });

  it('sections wins when both exist', () => {
    const profile = normalizeCourtDocumentSections({
      ...US_DEFAULT_PROFILE,
      sections: { prayerHeadingRequired: true, certificateSeparatePage: true, signatureKeepTogether: true, verificationKeepTogether: true },
      courtDocument: { prayerHeadingRequired: false, certificateSeparatePage: false, signatureKeepTogether: false, verificationKeepTogether: false },
    });
    expect(profile.sections?.prayerHeadingRequired).toBe(true);
    expect(profile.courtDocument?.prayerHeadingRequired).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. mergeJurisdictionProfiles Unit Tests
// ═══════════════════════════════════════════════════════════════

describe('mergeJurisdictionProfiles', () => {
  it('returns base when no overrides', () => {
    const merged = mergeJurisdictionProfiles(US_DEFAULT_PROFILE);
    expect(merged.key).toBe('us-default');
    expect(merged).not.toBe(US_DEFAULT_PROFILE); // should be a clone
  });

  it('null/undefined overrides are skipped', () => {
    const merged = mergeJurisdictionProfiles(US_DEFAULT_PROFILE, null, undefined);
    expect(merged.key).toBe('us-default');
  });

  it('later overrides win over earlier ones', () => {
    const merged = mergeJurisdictionProfiles(
      US_DEFAULT_PROFILE,
      { key: 'first' } as Partial<JurisdictionProfile>,
      { key: 'second' } as Partial<JurisdictionProfile>,
    );
    expect(merged.key).toBe('second');
  });

  it('does not mutate inputs', () => {
    const original = structuredClone(US_DEFAULT_PROFILE);
    mergeJurisdictionProfiles(US_DEFAULT_PROFILE, TX_DEFAULT_PROFILE);
    expect(US_DEFAULT_PROFILE).toEqual(original);
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. Backward Compatibility
// ═══════════════════════════════════════════════════════════════

describe('backward compatibility', () => {
  it('resolveSharedJurisdictionProfile still works with legacy input', () => {
    const { profile } = resolveSharedJurisdictionProfile({
      state: 'Texas',
      county: 'Harris',
    });
    expect(profile.key).toBe('tx-default');
  });

  it('null input returns US default', () => {
    const { profile, meta } = resolveSharedJurisdictionProfile(null);
    expect(profile.key).toBe('us-default');
    expect(meta.source).toBe('global_default');
  });

  it('invalid profileKey falls back to match logic', () => {
    const { profile } = resolveSharedJurisdictionProfile({
      profileKey: 'nonexistent',
      state: 'Florida',
    });
    expect(profile.key).toBe('fl-default');
  });

  it('every profile in PROFILE_REGISTRY has required blocks', () => {
    for (const [key, profile] of PROFILE_REGISTRY.entries()) {
      expect(profile.key).toBe(key);
      expect(profile.page).toBeDefined();
      expect(profile.typography).toBeDefined();
      expect(profile.pdf).toBeDefined();
    }
  });
});
