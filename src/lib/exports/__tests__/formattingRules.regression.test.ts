import { describe, expect, it } from 'vitest';
import {
  resolveExportJurisdictionProfile,
  toExportFormattingRules,
} from '../jurisdiction/resolveExportJurisdictionProfile';

describe('export formatting rules', () => {
  it('preserves Texas profile page numbering preference', () => {
    const profile = resolveExportJurisdictionProfile({
      state: 'Texas',
      county: 'Fort Bend',
    });
    const rules = toExportFormattingRules(profile);

    expect(profile.pageNumbering?.enabled).toBe(false);
    expect(rules.pageNumbering).toBe(false);
    expect(rules.footerEnabled).toBe(false);
  });
});
