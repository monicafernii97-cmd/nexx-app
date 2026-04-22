/**
 * Orchestrator Regression Tests
 *
 * Verifies that `generateLegalPDF()` is the single authority for
 * legal PDF generation, with correct pipeline ordering, validation,
 * error taxonomy, and result contract.
 *
 * Tests the orchestrator's sync validation/render checks using
 * mocked Puppeteer PDF output. Covers:
 *   - Valid input → full result contract
 *   - Structural validation blocks invalid docs
 *   - HTML structure sanity check catches shell-only renders
 *   - PDF validation catches corrupt buffers
 *   - Profile resolution metadata present
 *   - Observability fields populated
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LegalDocumentGenerationError } from '../errors';
import type { GenerateLegalPDFResult } from '../generateLegalPDF';

// ── Fixtures ──

const VALID_TEXAS_PLEADING = `
CAUSE NO. 2024-DCV-0001-A

IN THE DISTRICT COURT
JOHN DOE                        §
                                §       IN THE DISTRICT COURT OF
VS.                             §       FORT BEND COUNTY, TEXAS
                                §
JANE DOE                        §       387TH JUDICIAL DISTRICT

ORIGINAL PETITION FOR DIVORCE

I. INTRODUCTION

Petitioner files this Original Petition for Divorce and respectfully shows the Court as follows.

II. DISCOVERY

Discovery in this case is intended to be conducted under Level 2 of Rule 190.

III. JURISDICTION AND VENUE

The Court has jurisdiction of this case under Section 6.301 of the Texas Family Code.

PRAYER

Petitioner prays that the Court grant the following:
1. A divorce dissolving the marriage
2. A just and right division of the community estate

Respectfully submitted,

/s/ John Doe
John Doe, Pro Se
123 Main Street
Sugar Land, TX 77478

CERTIFICATE OF SERVICE

I certify that a true copy of the above was served on the respondent on this date.

/s/ John Doe
`;

const EMPTY_BODY_TEXT = `

UNTITLED DOCUMENT

`;

// ── Minimal valid PDF fixture ──
const VALID_PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n' +
  'xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n' +
  '0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF\n' +
  // Pad to meet MIN_PDF_BYTES (1024)
  ' '.repeat(800),
);

// ── Mock Convex query ──
const mockConvexQuery = async () => ({
  state: 'Texas',
  county: 'Fort Bend',
  courtName: '387th District Court',
  judicialDistrict: '387th Judicial District',
});

// ── Mock renderHTMLToPDF ──
vi.mock('@/lib/pdf/renderHTMLToPDF', () => ({
  renderHTMLToPDF: vi.fn(async () => VALID_PDF_BYTES),
}));

describe('generateLegalPDF — orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all required result fields for valid input', async () => {
    const { generateLegalPDF } = await import('../generateLegalPDF');

    const result: GenerateLegalPDFResult = await generateLegalPDF({
      rawText: VALID_TEXAS_PLEADING,
      convexQuery: mockConvexQuery,
    });

    // ── Result contract ──
    expect(result.parsed).toBeDefined();
    expect(result.parsed.title.main).toBeTruthy();
    expect(result.parsed.sections.length).toBeGreaterThan(0);

    expect(result.documentType).toBeTruthy();
    expect(result.courtSettings).toBeDefined();

    expect(result.jurisdictionProfile).toBeDefined();
    expect(result.jurisdictionProfile.key).toBeTruthy();

    expect(result.profileResolutionMeta).toBeDefined();
    expect(result.profileResolutionMeta.profileKey).toBe(result.jurisdictionProfile.key);
    expect(['court_exact_match', 'county_state_match', 'state_default', 'global_default'])
      .toContain(result.profileResolutionMeta.source);

    expect(result.documentTypeProfile).toBeDefined();
    expect(result.validation).toBeDefined();
    expect(result.validation.ok).toBe(true);
    expect(result.validation.blockers).toHaveLength(0);

    expect(result.preflight).toBeDefined();

    expect(result.html).toBeTruthy();
    expect(result.html.length).toBeGreaterThan(200);

    expect(result.pdfBuffer).toBeDefined();
    expect(result.pdfBuffer.length).toBeGreaterThan(0);

    expect(result.pdfMeta).toBeDefined();
    expect(result.pdfMeta.byteLength).toBeGreaterThan(0);
    expect(result.pdfMeta.sha256).toBeTruthy();

    expect(result.filename).toBeTruthy();
    expect(result.filename.endsWith('.pdf')).toBe(true);
  });

  it('resolves Texas profile for Texas court settings', async () => {
    const { generateLegalPDF } = await import('../generateLegalPDF');

    const result = await generateLegalPDF({
      rawText: VALID_TEXAS_PLEADING,
      convexQuery: mockConvexQuery,
    });

    expect(result.jurisdictionProfile.key).toMatch(/^tx/);
    expect(result.profileResolutionMeta.profileKey).toMatch(/^tx/);
  });

  it('throws LEGAL_DOCUMENT_VALIDATION_FAILED for empty body', async () => {
    const { generateLegalPDF } = await import('../generateLegalPDF');

    await expect(
      generateLegalPDF({
        rawText: EMPTY_BODY_TEXT,
        convexQuery: mockConvexQuery,
      }),
    ).rejects.toThrow(LegalDocumentGenerationError);

    try {
      await generateLegalPDF({
        rawText: EMPTY_BODY_TEXT,
        convexQuery: mockConvexQuery,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(LegalDocumentGenerationError);
      const typed = err as LegalDocumentGenerationError;
      expect(typed.code).toBe('LEGAL_DOCUMENT_VALIDATION_FAILED');
    }
  });

  it('uses fallbackTitle when parser returns UNTITLED DOCUMENT', async () => {
    const { generateLegalPDF } = await import('../generateLegalPDF');

    const minimalText = `I. INTRODUCTION\n\nThis is some body text for the document.\n\nII. BACKGROUND\n\nMore body content here.`;

    const result = await generateLegalPDF({
      rawText: minimalText,
      convexQuery: mockConvexQuery,
      fallbackTitle: 'MOTION TO COMPEL DISCOVERY',
    });

    expect(result.parsed.title.main).toBe('MOTION TO COMPEL DISCOVERY');
  });

  it('throws LEGAL_DOCUMENT_PDF_INVALID for corrupt PDF buffer', async () => {
    // Override the mock to return corrupt bytes
    const { renderHTMLToPDF } = await import('@/lib/pdf/renderHTMLToPDF');
    const mockedRender = vi.mocked(renderHTMLToPDF);
    mockedRender.mockResolvedValueOnce(Buffer.from('NOT_A_PDF_AT_ALL_' + ' '.repeat(1100)));

    const { generateLegalPDF } = await import('../generateLegalPDF');

    await expect(
      generateLegalPDF({
        rawText: VALID_TEXAS_PLEADING,
        convexQuery: mockConvexQuery,
      }),
    ).rejects.toThrow(LegalDocumentGenerationError);

    // Restore
    mockedRender.mockResolvedValue(VALID_PDF_BYTES);
  });

  it('includes preflight as advisory (non-blocking)', async () => {
    const { generateLegalPDF } = await import('../generateLegalPDF');

    // Text with no prayer/signature/certificate → preflight warns, but doesn't block
    const textWithoutClosing = `MOTION FOR SUMMARY JUDGMENT\n\nI. INTRODUCTION\n\nMovant moves for summary judgment.\n\nII. ARGUMENT\n\nThe undisputed facts establish.`;

    const result = await generateLegalPDF({
      rawText: textWithoutClosing,
      convexQuery: mockConvexQuery,
    });

    // Should succeed (preflight is advisory)
    expect(result.validation.ok).toBe(true);
    expect(result.preflight).toBeDefined();
    // Preflight should have warnings about missing sections
    expect(result.preflight.warnings.length).toBeGreaterThan(0);
  });
});
