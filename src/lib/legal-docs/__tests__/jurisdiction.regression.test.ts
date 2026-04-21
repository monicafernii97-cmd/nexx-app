/**
 * Jurisdiction Profile Resolution Regression Tests
 *
 * Locks down that the correct profile is selected per state/county/court
 * and that formatting overrides are applied correctly.
 * Prevents: wrong profile applied, Texas rules leaking to other states,
 * custom overrides silently dropped.
 */

import { describe, it, expect } from 'vitest';
import { resolveJurisdictionProfile } from '../jurisdiction/resolveJurisdictionProfile';

describe('jurisdiction profile regression — multi-state pleadings', () => {
  it('applies Texas profile for Texas settings', () => {
    const profile = resolveJurisdictionProfile({
      state: 'Texas',
      county: 'Harris',
      courtName: 'District Court',
    });

    expect(profile.key).toBe('tx-default');
    expect(profile.caption.style).toBe('texas_pleading');
    expect(profile.caption.useThreeColumnTable).toBe(true);
  });

  it('applies Fort Bend 387th county profile when court matches', () => {
    const profile = resolveJurisdictionProfile({
      state: 'Texas',
      county: 'Fort Bend',
      courtName: '387th Judicial District Court',
      judicialDistrict: '387th Judicial District',
    });

    expect(profile.key).toBe('tx-fort-bend-387th');
    expect(profile.county).toBe('Fort Bend');
  });

  it('falls back to tx-default when Fort Bend but no 387th match', () => {
    const profile = resolveJurisdictionProfile({
      state: 'Texas',
      county: 'Fort Bend',
      courtName: 'Some Other Court',
    });

    expect(profile.key).toBe('tx-default');
  });

  it('does not apply Texas pleading rules to Florida', () => {
    const profile = resolveJurisdictionProfile({
      state: 'Florida',
      county: 'Miami-Dade',
      courtName: 'Eleventh Judicial Circuit',
    });

    expect(profile.caption.style).not.toBe('texas_pleading');
    expect(profile.caption.useThreeColumnTable).toBe(false);
  });

  it('does not apply Texas pleading rules to California', () => {
    const profile = resolveJurisdictionProfile({
      state: 'California',
      county: 'Los Angeles',
      courtName: 'Superior Court of California',
    });

    expect(profile.caption.style).not.toBe('texas_pleading');
    expect(profile.caption.useThreeColumnTable).toBe(false);
  });

  it('uses us-default profile when no court settings exist', () => {
    const profile = resolveJurisdictionProfile(null);

    expect(profile.key).toBe('us-default');
    expect(profile.page.size).toBe('Letter');
  });

  it('uses us-default profile for undefined settings', () => {
    const profile = resolveJurisdictionProfile(undefined);

    expect(profile.key).toBe('us-default');
  });

  it('applies custom margin overrides from formatting overrides', () => {
    const profile = resolveJurisdictionProfile({
      state: 'Texas',
      county: 'Fort Bend',
      formattingOverrides: {
        marginTop: 1.25,
        marginRight: 1.0,
        marginBottom: 1.0,
        marginLeft: 1.0,
      },
    });

    expect(profile.page.marginsPt.top).toBe(90); // 1.25 * 72
    expect(profile.page.marginsPt.right).toBe(72);
  });

  it('applies custom font overrides', () => {
    const profile = resolveJurisdictionProfile({
      state: 'Texas',
      county: 'Harris',
      formattingOverrides: {
        fontFamily: 'Arial',
        fontSize: 14,
      },
    });

    expect(profile.typography.fontFamily).toContain('Arial');
    expect(profile.typography.fontSizePt).toBe(14);
  });

  it('preserves Texas caption config even with formatting overrides', () => {
    const profile = resolveJurisdictionProfile({
      state: 'Texas',
      county: 'Harris',
      formattingOverrides: {
        fontSize: 14,
      },
    });

    // Formatting overrides should NOT change caption style
    expect(profile.caption.style).toBe('texas_pleading');
    expect(profile.caption.useThreeColumnTable).toBe(true);
  });
});
