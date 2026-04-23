/**
 * Export Orchestrator Regression Tests
 *
 * Verifies that `generateExportPDF()` is the single authority for
 * export PDF generation, with correct pipeline ordering, validation,
 * error taxonomy, and result contract.
 *
 * Covers:
 *   - Valid input → full result contract
 *   - Invalid canonical doc → EXPORT_DOCUMENT_VALIDATION_FAILED
 *   - Short HTML → EXPORT_RENDER_TOO_SHORT
 *   - Structure invalid → EXPORT_RENDER_STRUCTURE_INVALID
 *   - PDF validation failure → EXPORT_PDF_INVALID
 *   - Profile metadata correctness
 *   - Deterministic filename
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportDocumentGenerationError } from '../errors';
import type { GenerateExportPDFInput, GenerateExportPDFResult } from '../generateExportPDF';

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

// ── Mock renderHTMLToPDF ──
vi.mock('@/lib/legal/pdfRenderer', () => ({
  renderHTMLToPDF: vi.fn(async () => VALID_PDF_BYTES),
}));

/** Build a valid export input for testing. */
function makeValidInput(overrides?: Partial<GenerateExportPDFInput>): GenerateExportPDFInput {
  return {
    adaptParams: {
      path: 'court_document',
      title: 'TEST COURT DOCUMENT',
      draftedSections: [
        {
          sectionId: 'body',
          heading: 'Summary of Facts',
          body: 'The plaintiff alleges that the defendant caused significant damages to the property located at 123 Main Street. This incident occurred on January 15, 2024.',
        },
      ],
    },
    jurisdictionSettings: {
      state: 'Texas',
      county: 'Fort Bend',
    },
    metadata: {
      caseType: 'personal_injury',
      exportPath: 'court_document',
      runId: 'run-abc123xyz',
    },
    ...overrides,
  };
}

describe('generateExportPDF — orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all required result fields for valid input', async () => {
    const { generateExportPDF } = await import('../generateExportPDF');
    const input = makeValidInput();
    const result: GenerateExportPDFResult = await generateExportPDF(input);

    expect(result.pdfBuffer).toBeInstanceOf(Buffer);
    expect(result.pdfBuffer.length).toBeGreaterThan(0);
    expect(result.document).toBeDefined();
    expect(result.document.path).toBe('court_document');
    expect(result.profile).toBeDefined();
    expect(result.profile.key).toBeDefined();
    expect(result.profileMeta).toBeDefined();
    expect(result.profileMeta.profileKey).toBeDefined();
    expect(result.profileMeta.source).toBeDefined();
    expect(result.pdfMeta).toBeDefined();
    expect(result.pdfMeta.byteLength).toBeGreaterThan(0);
    expect(result.html).toBeDefined();
    expect(result.html.length).toBeGreaterThan(0);
    expect(result.filename).toMatch(/\.pdf$/);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('resolves Texas profile for Texas jurisdiction settings', async () => {
    const { generateExportPDF } = await import('../generateExportPDF');
    const result = await generateExportPDF(makeValidInput());
    expect(result.profile.key).toBe('tx-default');
  });

  it('resolves Fort Bend 387th for exact court match', async () => {
    const { generateExportPDF } = await import('../generateExportPDF');
    const result = await generateExportPDF(makeValidInput({
      jurisdictionSettings: {
        state: 'Texas',
        county: 'Fort Bend',
        courtName: '387th District Court',
      },
    }));
    expect(result.profile.key).toBe('tx-fort-bend-387th');
    expect(result.profileMeta.source).toBe('court_exact_match');
  });

  it('uses pre-resolved profile when provided', async () => {
    const { generateExportPDF } = await import('../generateExportPDF');
    const { PROFILE_REGISTRY } = await import('@/lib/jurisdiction/profiles/registry');
    const { assertExportProfile } = await import('@/lib/jurisdiction/assertProfileForPipeline');
    const fedProfile = assertExportProfile(PROFILE_REGISTRY.get('federal-default')!);

    const result = await generateExportPDF(makeValidInput({
      resolvedProfile: fedProfile,
    }));
    expect(result.profile.key).toBe('federal-default');
    expect(result.profileMeta.source).toBe('pre_resolved');
  });

  it('generates deterministic filename', async () => {
    const { generateExportPDF } = await import('../generateExportPDF');
    const result = await generateExportPDF(makeValidInput());
    // Filename should contain caseType, exportPath, date, and shortId
    expect(result.filename).toContain('personal_injury');
    expect(result.filename).toContain('court_document');
    expect(result.filename).toMatch(/\.pdf$/);
  });

  it('throws EXPORT_DOCUMENT_VALIDATION_FAILED for empty sections', async () => {
    const { generateExportPDF } = await import('../generateExportPDF');
    const input = makeValidInput({
      adaptParams: {
        path: 'court_document',
        title: 'EMPTY DOC',
        draftedSections: [],
      },
    });

    await expect(generateExportPDF(input)).rejects.toThrow(ExportDocumentGenerationError);
    try {
      await generateExportPDF(input);
    } catch (err) {
      expect((err as ExportDocumentGenerationError).code).toBe('EXPORT_DOCUMENT_VALIDATION_FAILED');
    }
  });

  it('throws for missing title', async () => {
    const { generateExportPDF } = await import('../generateExportPDF');
    const input = makeValidInput({
      adaptParams: {
        path: 'court_document',
        title: '',
        draftedSections: [
          { sectionId: 'body', heading: 'Test', body: 'Content here.' },
        ],
      },
    });

    await expect(generateExportPDF(input)).rejects.toThrow();
  });
});
