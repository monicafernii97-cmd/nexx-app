/**
 * Export PDF Orchestrator
 *
 * Single-call entry point for the canonical export pipeline:
 *   adapt → resolve profile → validate → render HTML → render PDF → validate buffer
 *
 * This replaces the fragile rendering steps (4-5) in the SSE route.
 */

import {
  adaptDraftedToCanonicalExport,
  type AdaptToCanonicalParams,
} from './adaptDraftedToCanonicalExport';
import { validateExportDocument } from './validateExportDocument';
import { renderExportHTML } from './renderExportHTML';
import {
  resolveExportJurisdictionProfile,
  toExportFormattingRules,
  type ExportSettingsInput,
} from './jurisdiction/resolveExportJurisdictionProfile';
import { renderHTMLToPDF } from '@/lib/legal/pdfRenderer';
import { validatePdfBuffer } from '@/lib/pdf/validatePdf';
import type { CanonicalExportDocument } from './types';
import type { ExportJurisdictionProfile } from './jurisdiction/types';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Input for the export PDF generation pipeline. */
export type GenerateExportPDFInput = {
  /** Parameters for building the canonical export document. */
  adaptParams: AdaptToCanonicalParams;
  /** Court/jurisdiction settings for profile resolution. */
  jurisdictionSettings: ExportSettingsInput;
  /** Optional cause number for PDF footer. */
  causeNumber?: string;
};

/** Output from the export PDF generation pipeline. */
export type GenerateExportPDFResult = {
  /** The PDF buffer. */
  pdfBuffer: Buffer;
  /** The canonical export document that was rendered. */
  document: CanonicalExportDocument;
  /** The resolved jurisdiction profile. */
  profile: ExportJurisdictionProfile;
  /** PDF validation metadata. */
  pdfMeta: { byteLength: number; sha256: string };
  /** The rendered HTML (for debugging). */
  html: string;
};

// ═══════════════════════════════════════════════════════════════
// Orchestrator
// ═══════════════════════════════════════════════════════════════

/**
 * Run the full canonical export pipeline.
 *
 * Steps:
 *   1. Build CanonicalExportDocument from adapt params
 *   2. Resolve ExportJurisdictionProfile from settings
 *   3. Validate document structure (blockers → throws)
 *   4. Render to HTML via path dispatcher
 *   5. Render HTML to PDF via Puppeteer
 *   6. Validate PDF buffer (corrupt → throws)
 *
 * @param input - Pipeline input
 * @returns Pipeline result with PDF buffer, document, and metadata
 * @throws If validation fails (blockers or invalid PDF)
 */
export async function generateExportPDF(
  input: GenerateExportPDFInput,
): Promise<GenerateExportPDFResult> {
  // 1. Build canonical document
  const document = adaptDraftedToCanonicalExport(input.adaptParams);

  // 2. Resolve profile
  const profile = resolveExportJurisdictionProfile(input.jurisdictionSettings);

  // 3. Validate structure
  const validation = validateExportDocument(document);
  if (!validation.canProceed) {
    const blockerMessages = validation.issues
      .filter((i) => i.severity === 'blocker')
      .map((i) => i.message)
      .join('; ');
    throw new Error(`Export validation failed: ${blockerMessages}`);
  }

  // 4. Render HTML
  const html = renderExportHTML(document, profile);

  // 5. Render PDF
  const rules = toExportFormattingRules(profile);
  const pdfBuffer = await renderHTMLToPDF(html, rules, input.causeNumber);

  // 6. Validate PDF buffer
  const pdfMeta = validatePdfBuffer(pdfBuffer);

  return {
    pdfBuffer,
    document,
    profile,
    pdfMeta,
    html,
  };
}
