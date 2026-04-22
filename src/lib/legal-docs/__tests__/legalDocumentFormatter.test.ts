/**
 * Legal Document Formatter — Regression Tests
 *
 * Covers the five spec-required regression tests plus additional
 * coverage for caption formats, bullet preservation, edge cases,
 * jurisdiction resolution, and the CourtFormattingRules adapter.
 */

import { describe, it, expect } from 'vitest';
import { parseLegalDocument, detectMissingRequiredSections } from '../parseLegalDocument';
import { renderLegalDocumentHTML } from '../renderLegalDocumentHTML';
import { generateLegalFilename } from '../generateLegalFilename';
import { preflightLegalDocument } from '../preflightLegalDocument';
import {
  resolveJurisdictionProfile,
  toCourtFormattingRules,
} from '../jurisdiction/resolveJurisdictionProfile';

// ═══════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════

const TEXAS_MOTION = `
CAUSE NO. 20-DCV-271717

IN THE INTEREST OF § IN THE DISTRICT COURT
AMELIA SOFIA FERNANDEZ PUGLIESE § 387TH JUDICIAL DISTRICT
A CHILD § FORT BEND COUNTY, TEXAS

PETITIONER'S SECOND AMENDED MOTION FOR TEMPORARY ORDERS
(Pending Final Hearing on Petition to Modify Parent–Child Relationship)

TO THE HONORABLE JUDGE OF SAID COURT:

I. BACKGROUND
1. First item.
2. Second item.

II. EMERGENCY RELIEF REQUESTED
Petitioner requests the following:
- Emergency custody modification
- Supervised visitation
- Temporary restraining order

III. BEST INTEREST OF THE CHILD
The following factors support the requested relief:
• Factor one is important.
• Factor two is critical.
• Factor three is decisive.

PRAYER

WHEREFORE, PREMISES CONSIDERED, Petitioner respectfully requests:
1. Relief one.
2. Relief two.
3. All other relief to which Petitioner is entitled.

Respectfully submitted,

Monica Fernandez
Petitioner, Pro Se

CERTIFICATE OF SERVICE

I certify that a true and correct copy of the foregoing was served on all parties.
Monica Fernandez
`;

const FEDERAL_MOTION = `
CASE NO. 4:24-cv-01234

UNITED STATES DISTRICT COURT
SOUTHERN DISTRICT OF TEXAS
HOUSTON DIVISION

JANE DOE,
Plaintiff,

v.

JOHN SMITH,
Defendant.

MOTION FOR SUMMARY JUDGMENT

Plaintiff moves for summary judgment on all claims.

I. FACTS

1. Fact one.
2. Fact two.

PRAYER

Plaintiff requests this Court grant summary judgment.

Respectfully submitted,

Jane Doe
Attorney for Plaintiff
`;

// ═══════════════════════════════════════════════════════════════
// Spec-Required Regression Tests (Section 14)
// ═══════════════════════════════════════════════════════════════

describe('legal document formatter', () => {
  it('parses title and subtitle', () => {
    const doc = parseLegalDocument(TEXAS_MOTION);
    expect(doc.title.main).toContain('SECOND AMENDED MOTION FOR TEMPORARY ORDERS');
    expect(doc.title.subtitle).toContain('Pending Final Hearing');
  });

  it('detects prayer as its own block', () => {
    const doc = parseLegalDocument(TEXAS_MOTION);
    expect(doc.prayer).not.toBeNull();
    expect(doc.prayer?.heading).toBe('PRAYER');
    expect(doc.prayer?.requests.length).toBe(3);
  });

  it('forces certificate as separate render block', () => {
    const doc = parseLegalDocument(TEXAS_MOTION);
    const profile = resolveJurisdictionProfile(
      { state: 'Texas', county: 'Fort Bend' },
    );
    const html = renderLegalDocumentHTML(doc, profile);
    expect(html).toContain('certificate-of-service');
    expect(html).toContain('CERTIFICATE OF SERVICE');
  });

  it('creates efile-safe filename', () => {
    const doc = parseLegalDocument(TEXAS_MOTION);
    const filename = generateLegalFilename(doc);
    expect(filename).toBe(
      'PETITIONERS_SECOND_AMENDED_MOTION_FOR_TEMPORARY_ORDERS_20-DCV-271717.pdf',
    );
  });

  it('splits merged numbered items instead of collapsing them', () => {
    const doc = parseLegalDocument(`
      II. TEST
      10. Alpha. 11. Beta. 12. Gamma.
    `);
    const firstBlock = doc.sections[0]?.blocks[0];
    expect(firstBlock?.type).toBe('numbered_list');
    if (firstBlock?.type === 'numbered_list') {
      expect(firstBlock.items.length).toBe(3);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Caption Detection
// ═══════════════════════════════════════════════════════════════

describe('caption detection', () => {
  it('parses Texas § caption', () => {
    const doc = parseLegalDocument(TEXAS_MOTION);
    expect(doc.caption).not.toBeNull();
    expect(doc.caption?.leftLines.length).toBeGreaterThan(0);
    expect(doc.caption?.rightLines.length).toBeGreaterThan(0);
    expect(doc.caption?.centerLines).toContain('§');
  });

  it('extracts cause number', () => {
    const doc = parseLegalDocument(TEXAS_MOTION);
    expect(doc.metadata.causeNumber).toBe('20-DCV-271717');
  });

  it('parses federal v. caption', () => {
    const doc = parseLegalDocument(FEDERAL_MOTION);
    expect(doc.caption).not.toBeNull();
    expect(doc.caption?.centerLines).toContain('v.');
    expect(doc.metadata.causeNumber).toBe('4:24-cv-01234');
  });

  it('handles minimal caption (cause number only)', () => {
    const doc = parseLegalDocument(`
      CASE NO. 99-1234
      MOTION TO DISMISS
      I. FACTS
      The case should be dismissed.
    `);
    expect(doc.caption).not.toBeNull();
    expect(doc.caption?.causeLine).toContain('CASE NO. 99-1234');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block Type Preservation
// ═══════════════════════════════════════════════════════════════

describe('block type preservation', () => {
  it('preserves bullet lists as bullet_list type', () => {
    const doc = parseLegalDocument(TEXAS_MOTION);
    const allBlocks = doc.sections.flatMap((s) => s.blocks);
    const bulletBlocks = allBlocks.filter((b) => b.type === 'bullet_list');
    expect(bulletBlocks.length).toBeGreaterThan(0);
  });

  it('preserves dash-bullets as bullet_list type', () => {
    const doc = parseLegalDocument(TEXAS_MOTION);
    const allBlocks = doc.sections.flatMap((s) => s.blocks);
    const bulletBlocks = allBlocks.filter((b) => b.type === 'bullet_list');
    // The '- ' items in section II
    expect(bulletBlocks.length).toBeGreaterThanOrEqual(1);
  });

  it('renders bullet items with bullet marker in HTML', () => {
    const doc = parseLegalDocument(TEXAS_MOTION);
    const profile = resolveJurisdictionProfile(
      { state: 'Texas', county: 'Fort Bend' },
    );
    const html = renderLegalDocumentHTML(doc, profile);
    expect(html).toContain('bullet-list');
  });

  it('keeps numbered lists as numbered_list type', () => {
    const doc = parseLegalDocument(TEXAS_MOTION);
    const allBlocks = doc.sections.flatMap((s) => s.blocks);
    const numberedBlocks = allBlocks.filter((b) => b.type === 'numbered_list');
    expect(numberedBlocks.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('edge cases', () => {
  it('handles empty input gracefully', () => {
    const doc = parseLegalDocument('');
    expect(doc.title.main).toBe('UNTITLED DOCUMENT');
    expect(doc.sections).toHaveLength(0);
    expect(doc.caption).toBeNull();
    expect(doc.prayer).toBeNull();
  });

  it('handles text with no structure', () => {
    const doc = parseLegalDocument('Just some random text that is not a legal document at all.');
    expect(doc.title.main).toBe('UNTITLED DOCUMENT');
    expect(doc.sections.length).toBeGreaterThanOrEqual(0);
  });

  it('handles WHEREFORE without explicit PRAYER heading', () => {
    const doc = parseLegalDocument(`
      MOTION TO DISMISS
      TO THE HONORABLE JUDGE:
      I. FACTS
      The defendant requests dismissal.
      WHEREFORE, defendant requests this Court dismiss the case.
      Respectfully submitted,
      John Smith
    `);
    expect(doc.prayer).not.toBeNull();
    expect(doc.prayer?.heading).toBe('PRAYER');
  });
});

// ═══════════════════════════════════════════════════════════════
// Jurisdiction Resolution
// ═══════════════════════════════════════════════════════════════

describe('jurisdiction profile resolution', () => {
  it('resolves Texas profile for Texas state', () => {
    const profile = resolveJurisdictionProfile(
      { state: 'Texas', county: 'Harris' },
    );
    expect(profile.key).toBe('tx-default');
    expect(profile.caption.useThreeColumnTable).toBe(true);
    expect(profile.caption.centerSymbol).toBe('§');
  });

  it('resolves Fort Bend 387th specific profile', () => {
    const profile = resolveJurisdictionProfile(
      { state: 'Texas', county: 'Fort Bend', judicialDistrict: '387th Judicial District' },
    );
    expect(profile.key).toBe('tx-fort-bend-387th');
    expect(profile.county).toBe('Fort Bend');
  });

  it('falls back to tx-default for Fort Bend without 387th', () => {
    const profile = resolveJurisdictionProfile(
      { state: 'Texas', county: 'Fort Bend' },
    );
    expect(profile.key).toBe('tx-default');
  });

  it('resolves FL default for Florida state', () => {
    const profile = resolveJurisdictionProfile(
      { state: 'Florida', county: 'Whatever' },
    );
    expect(profile.key).toBe('fl-default');
    expect(profile.caption.useThreeColumnTable).toBe(false);
  });

  it('resolves US default for null settings', () => {
    const profile = resolveJurisdictionProfile(null);
    expect(profile.key).toBe('us-default');
  });
});

// ═══════════════════════════════════════════════════════════════
// CourtFormattingRules Adapter
// ═══════════════════════════════════════════════════════════════

describe('toCourtFormattingRules adapter', () => {
  it('converts Texas profile correctly', () => {
    const profile = resolveJurisdictionProfile(
      { state: 'Texas', county: 'Fort Bend', judicialDistrict: '387th Judicial District' },
    );
    const rules = toCourtFormattingRules(profile);

    expect(rules.paperWidth).toBe(8.5);
    expect(rules.paperHeight).toBe(11);
    expect(rules.fontFamily).toContain('Times New Roman');
    expect(rules.fontSize).toBe(12);
    expect(rules.lineSpacing).toBe(1.5);
    expect(rules.captionStyle).toBe('section-symbol');
    expect(rules.captionColumnWidths.left).toBe(3.125);
    expect(rules.captionColumnWidths.center).toBe(0.083);
    expect(rules.bodyAlignment).toBe('justify');
  });

  it('converts US default profile correctly', () => {
    const profile = resolveJurisdictionProfile(null);
    const rules = toCourtFormattingRules(profile);

    expect(rules.captionStyle).toBe('centered');
    expect(rules.marginTop).toBe(1); // 72pt / 72 = 1in
    expect(rules.marginLeft).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Preflight Validator
// ═══════════════════════════════════════════════════════════════

describe('preflight validator', () => {
  it('passes for complete Texas motion', () => {
    const doc = parseLegalDocument(TEXAS_MOTION);
    const result = preflightLegalDocument(doc);
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('warns for empty input', () => {
    const doc = parseLegalDocument('');
    const result = preflightLegalDocument(doc);
    expect(result.ok).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings).toContain('Document title not detected.');
    expect(result.warnings).toContain('Caption block not detected.');
  });

  it('detectMissingRequiredSections returns correct flags', () => {
    const doc = parseLegalDocument(TEXAS_MOTION);
    const status = detectMissingRequiredSections(doc);
    expect(status.hasCaption).toBe(true);
    expect(status.hasTitle).toBe(true);
    expect(status.hasPrayer).toBe(true);
    expect(status.hasSignature).toBe(true);
    expect(status.hasCertificate).toBe(true);
    expect(status.hasSections).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Reusability Across Motion Types
// ═══════════════════════════════════════════════════════════════

describe('reusability across motion types', () => {
  it('parses federal motion for summary judgment', () => {
    const doc = parseLegalDocument(FEDERAL_MOTION);
    expect(doc.title.main).toContain('MOTION FOR SUMMARY JUDGMENT');
    expect(doc.prayer).not.toBeNull();
    expect(doc.signature).not.toBeNull();
    expect(doc.sections.length).toBeGreaterThan(0);
  });

  it('renders federal motion with generic profile', () => {
    const doc = parseLegalDocument(FEDERAL_MOTION);
    const profile = resolveJurisdictionProfile(null);
    const html = renderLegalDocumentHTML(doc, profile);
    expect(html).toContain('MOTION FOR SUMMARY JUDGMENT');
    expect(html).toContain('PRAYER');
    // Generic profile should use generic caption, not 3-column table element
    expect(html).toContain('caption-generic');
    expect(html).not.toContain('<table class="caption-table"');
  });

  it('handles motion to refer to mediation', () => {
    const doc = parseLegalDocument(`
      CAUSE NO. 22-FAM-5678
      MOTION TO REFER TO MEDIATION
      TO THE HONORABLE JUDGE:
      I. BACKGROUND
      The parties should mediate.
      PRAYER
      1. Order mediation.
      Respectfully submitted,
      Test User
    `);
    expect(doc.title.main).toContain('MOTION TO REFER TO MEDIATION');
    expect(doc.metadata.causeNumber).toBe('22-FAM-5678');
  });

  it('handles notice of hearing', () => {
    const doc = parseLegalDocument(`
      NOTICE OF HEARING
      TO THE HONORABLE JUDGE:
      Please take notice that a hearing is set.
      Respectfully submitted,
      Test User
    `);
    expect(doc.title.main).toContain('NOTICE OF HEARING');
  });
});

// ═══════════════════════════════════════════════════════════════
// mapSavedToCourtSettings Tests
// ═══════════════════════════════════════════════════════════════

import { mapSavedToCourtSettings } from '../jurisdiction/resolveJurisdictionProfile';

describe('mapSavedToCourtSettings', () => {
  it('returns minimal fallback for null saved settings', () => {
    const result = mapSavedToCourtSettings(null);
    expect(result).toEqual({ jurisdiction: {} });
  });

  it('returns minimal fallback for undefined saved settings', () => {
    const result = mapSavedToCourtSettings(undefined);
    expect(result).toEqual({ jurisdiction: {} });
  });

  it('maps basic court identity fields', () => {
    const result = mapSavedToCourtSettings({
      state: 'Texas',
      county: 'Fort Bend',
      courtName: '387th Judicial District Court',
      judicialDistrict: '387th Judicial District',
    });

    expect(result.jurisdiction!.country).toBe('United States');
    expect(result.jurisdiction!.state).toBe('Texas');
    expect(result.jurisdiction!.county).toBe('Fort Bend');
    expect(result.jurisdiction!.courtName).toBe('387th Judicial District Court');
    expect(result.jurisdiction!.district).toBe('387th Judicial District');
  });

  it('maps formatting overrides when present', () => {
    const result = mapSavedToCourtSettings({
      state: 'Texas',
      county: 'Fort Bend',
      formattingOverrides: {
        captionStyle: 'section-symbol',
        fontFamily: 'Arial',
        fontSize: 14,
        lineSpacing: 2.0,
        marginTop: 1.0,
        marginRight: 1.0,
        marginBottom: 1.0,
        marginLeft: 1.0,
      },
    });

    expect(result.formatting).toBeDefined();
    expect(result.formatting!.pleadingStyle).toBe('caption_table');
    expect(result.formatting!.defaultFont).toBe('"Arial", Times, serif');
    expect(result.formatting!.defaultFontSizePt).toBe(14);
    expect(result.formatting!.lineSpacing).toBe(2.0);
    expect(result.formatting!.pageMarginsPt).toEqual({
      top: 72,
      right: 72,
      bottom: 72,
      left: 72,
    });
  });

  it('maps versus captionStyle to federal_caption', () => {
    const result = mapSavedToCourtSettings({
      state: 'California',
      county: 'Los Angeles',
      formattingOverrides: { captionStyle: 'versus' },
    });
    expect(result.formatting!.pleadingStyle).toBe('federal_caption');
  });

  it('maps centered captionStyle to simple_caption', () => {
    const result = mapSavedToCourtSettings({
      state: 'Florida',
      county: 'Miami-Dade',
      formattingOverrides: { captionStyle: 'centered' },
    });
    expect(result.formatting!.pleadingStyle).toBe('simple_caption');
  });

  it('omits formatting when no overrides present', () => {
    const result = mapSavedToCourtSettings({
      state: 'Texas',
      county: 'Harris',
    });
    expect(result.formatting).toBeUndefined();
  });

  it('detects LEGAL page size from paperHeight', () => {
    const result = mapSavedToCourtSettings({
      state: 'Texas',
      county: 'Fort Bend',
      formattingOverrides: { paperHeight: 14 },
    });
    expect(result.formatting!.pageSize).toBe('LEGAL');
  });

  it('produces margins when only right and left are overridden', () => {
    const result = mapSavedToCourtSettings({
      state: 'Texas',
      county: 'Fort Bend',
      formattingOverrides: { marginRight: 1.5, marginLeft: 1.5 },
    });
    expect(result.formatting!.pageMarginsPt).toEqual({
      top: 72,       // default 1in * 72
      right: 108,    // 1.5in * 72
      bottom: 72,    // default 1in * 72
      left: 108,     // 1.5in * 72
    });
  });

  it('returns undefined pageSize for non-standard paperHeight', () => {
    const result = mapSavedToCourtSettings({
      state: 'Texas',
      county: 'Fort Bend',
      formattingOverrides: { paperHeight: 12.5 },
    });
    expect(result.formatting!.pageSize).toBeUndefined();
  });
});
