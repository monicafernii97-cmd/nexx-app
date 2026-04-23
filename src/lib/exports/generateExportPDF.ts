/**
 * Export PDF Orchestrator
 *
 * THE SINGLE AUTHORITY for all export PDF generation.
 *
 * No route may manually resolve profiles, adapt documents, render HTML,
 * render PDF, validate buffers, or generate filenames. This orchestrator
 * owns the full pipeline in this exact order:
 *
 *   1. resolveProfileStage      — shared resolver + export assertion
 *   2. adaptDocumentStage       — build CanonicalExportDocument
 *   3. validateDocumentStage    — structural validation (blockers → throw)
 *   4. renderHTMLStage          — path-dispatched HTML rendering
 *   5. assertStructureStage     — HTML structural sanity check
 *   6. renderPDFStage           — Puppeteer PDF rendering
 *   7. validatePDFStage         — buffer integrity check
 *   8. generateFilenameStage    — deterministic filename
 *
 * Every failure throws a typed `ExportDocumentGenerationError`.
 * No partial success is ever returned.
 */

import {
  adaptDraftedToCanonicalExport,
  type AdaptToCanonicalParams,
} from './adaptDraftedToCanonicalExport';
import { validateExportDocument } from './validateExportDocument';
import { renderExportHTML, MIN_RENDERED_EXPORT_HTML_LENGTH } from './renderExportHTML';
import {
  resolveExportProfileWithMeta,
  toExportFormattingRules,
  type ExportSettingsInput,
} from './jurisdiction/resolveExportJurisdictionProfile';
import { renderHTMLToPDF } from '@/lib/legal/pdfRenderer';
import { validatePdfBuffer, type ValidatedPdf } from '@/lib/pdf/validatePdf';
import { assertRenderedExportStructure } from './assertRenderedExportStructure';
import {
  ExportDocumentGenerationError,
  mapToExportGenerationError,
} from './errors';
import type { CanonicalExportDocument, ExportPath } from './types';
import type { ExportJurisdictionProfile } from './jurisdiction/types';
import type { ProfileResolutionMeta } from '@/lib/jurisdiction/types';

// ═══════════════════════════════════════════════════════════════
// Public Types
// ═══════════════════════════════════════════════════════════════

/** Input for the export PDF generation pipeline. */
export type GenerateExportPDFInput = {
  /** Parameters for building the canonical export document. */
  adaptParams: AdaptToCanonicalParams;
  /** Court/jurisdiction settings for profile resolution. */
  jurisdictionSettings: ExportSettingsInput;
  /**
   * Optional pre-resolved profile. When provided, the orchestrator
   * skips internal resolution and uses this profile directly.
   * Prevents double-resolution when the route already resolved for
   * caption/exhibit setup.
   */
  resolvedProfile?: ExportJurisdictionProfile;
  /** Optional cause number for PDF footer. */
  causeNumber?: string;
  /** Metadata for filename generation. */
  metadata: {
    caseType: string;
    exportPath: string;
    runId: string;
  };
};

/** Output from the export PDF generation pipeline. */
export type GenerateExportPDFResult = {
  /** The PDF buffer. */
  pdfBuffer: Buffer;
  /** The canonical export document that was rendered. */
  document: CanonicalExportDocument;
  /** The resolved jurisdiction profile. */
  profile: ExportJurisdictionProfile;
  /** How the profile was selected — for observability. */
  profileMeta: ProfileResolutionMeta;
  /** PDF validation metadata. */
  pdfMeta: ValidatedPdf;
  /** The rendered HTML (for debugging). */
  html: string;
  /** Deterministic filename for the PDF. */
  filename: string;
  /** Pipeline duration in milliseconds. */
  durationMs: number;
};

// ═══════════════════════════════════════════════════════════════
// Orchestrator
// ═══════════════════════════════════════════════════════════════

/**
 * Run the full canonical export pipeline.
 *
 * Single public entrypoint — internally composed of stage helpers.
 * Every failure throws a typed `ExportDocumentGenerationError`.
 *
 * @param input - Pipeline input
 * @returns Pipeline result with PDF buffer, document, and metadata
 * @throws ExportDocumentGenerationError on any pipeline failure
 */
export async function generateExportPDF(
  input: GenerateExportPDFInput,
): Promise<GenerateExportPDFResult> {
  const startTime = Date.now();

  try {
    // 1. Resolve jurisdiction profile (skip if pre-resolved)
    const { profile, meta: profileMeta } = input.resolvedProfile
      ? { profile: input.resolvedProfile, meta: { profileKey: input.resolvedProfile.key, source: 'pre_resolved' as const } }
      : resolveProfileStage(input.jurisdictionSettings);

    // 2. Build canonical export document
    const document = adaptDocumentStage(input.adaptParams);

    // 3. Validate document structure
    validateDocumentStage(document);

    // 4. Render HTML via path dispatcher
    const html = renderHTMLStage(document, profile);

    // 5. Assert HTML structural integrity
    assertStructureStage(html, document.path as ExportPath);

    // 6. Render PDF via Puppeteer
    const pdfBuffer = await renderPDFStage(html, profile, input.causeNumber);

    // 7. Validate PDF buffer
    const pdfMeta = validatePDFStage(pdfBuffer);

    // 7b. Assert metadata consistency — prevent caller/document identity drift
    if (input.metadata.exportPath !== document.path) {
      console.warn(
        `[ExportPDF] Metadata drift: metadata.exportPath="${input.metadata.exportPath}" vs document.path="${document.path}". Using document.path for filename.`,
      );
    }

    // 8. Generate deterministic filename (prefer document.path as authoritative)
    const filename = generateFilenameStage({
      ...input.metadata,
      exportPath: document.path,
    });

    const durationMs = Date.now() - startTime;

    // ── Observability ──
    console.log(
      `[ExportPDF] Generated: path=${document.path}, profile=${profileMeta.profileKey} (${profileMeta.source}), ` +
      `pdf=${pdfMeta.byteLength}b, duration=${durationMs}ms`,
    );

    return {
      pdfBuffer,
      document,
      profile,
      profileMeta,
      pdfMeta,
      html,
      filename,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const mapped = mapToExportGenerationError(error);
    console.error(
      `[ExportPDF] Failed: path=${input.metadata.exportPath}, ` +
      `code=${mapped.code}, duration=${durationMs}ms, message=${mapped.message}`,
    );
    throw mapped;
  }
}

// ═══════════════════════════════════════════════════════════════
// Stage Helpers
// ═══════════════════════════════════════════════════════════════

/** Stage 1: Resolve export jurisdiction profile from settings. */
function resolveProfileStage(settings: ExportSettingsInput) {
  try {
    return resolveExportProfileWithMeta(settings);
  } catch (err) {
    throw new ExportDocumentGenerationError({
      code: 'EXPORT_PROFILE_RESOLUTION_FAILED',
      message: `Export profile resolution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      details: err,
    });
  }
}

/** Stage 2: Build canonical export document from adapt params. */
function adaptDocumentStage(params: AdaptToCanonicalParams): CanonicalExportDocument {
  try {
    return adaptDraftedToCanonicalExport(params);
  } catch (err) {
    throw new ExportDocumentGenerationError({
      code: 'EXPORT_ADAPTATION_FAILED',
      message: `Export document adaptation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      details: err,
    });
  }
}

/** Stage 3: Validate document structure — blocker issues throw. */
function validateDocumentStage(document: CanonicalExportDocument): void {
  const validation = validateExportDocument(document);
  if (!validation.canProceed) {
    const blockerMessages = validation.issues
      .filter((i) => i.severity === 'blocker')
      .map((i) => i.message)
      .join('; ');
    throw new ExportDocumentGenerationError({
      code: 'EXPORT_DOCUMENT_VALIDATION_FAILED',
      message: `Export validation failed: ${blockerMessages}`,
      details: validation,
    });
  }
}

/** Stage 4: Render HTML via path-specific dispatcher. */
function renderHTMLStage(
  document: CanonicalExportDocument,
  profile: ExportJurisdictionProfile,
): string {
  const html = renderExportHTML(document, profile);

  if (html.length < MIN_RENDERED_EXPORT_HTML_LENGTH) {
    throw new ExportDocumentGenerationError({
      code: 'EXPORT_RENDER_TOO_SHORT',
      message: `Rendered export HTML is ${html.length} chars (minimum ${MIN_RENDERED_EXPORT_HTML_LENGTH}) — possible rendering failure.`,
    });
  }

  return html;
}

/** Stage 5: Assert HTML contains expected structural markers. */
function assertStructureStage(html: string, path: ExportPath): void {
  try {
    assertRenderedExportStructure(html, path);
  } catch (err) {
    throw new ExportDocumentGenerationError({
      code: 'EXPORT_RENDER_STRUCTURE_INVALID',
      message: `Export HTML structure check failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      details: err,
    });
  }
}

/** Stage 6: Render HTML to PDF via Puppeteer. */
async function renderPDFStage(
  html: string,
  profile: ExportJurisdictionProfile,
  causeNumber?: string,
): Promise<Buffer> {
  try {
    const rules = toExportFormattingRules(profile);
    return await renderHTMLToPDF(html, rules, causeNumber);
  } catch (err) {
    throw new ExportDocumentGenerationError({
      code: 'EXPORT_PDF_RENDER_FAILED',
      message: `Export PDF rendering failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      details: err,
    });
  }
}

/** Stage 7: Validate the PDF buffer integrity (header, size). */
function validatePDFStage(pdfBuffer: Buffer): ValidatedPdf {
  try {
    return validatePdfBuffer(pdfBuffer);
  } catch (err) {
    throw new ExportDocumentGenerationError({
      code: 'EXPORT_PDF_INVALID',
      message: `Export PDF buffer validation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      details: err,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Filename Generation
// ═══════════════════════════════════════════════════════════════

/** Stage 8: Generate a deterministic PDF filename from metadata. */
function generateFilenameStage(metadata: {
  caseType: string;
  exportPath: string;
  runId: string;
}): string {
  try {
    const date = new Date().toISOString().slice(0, 10);
    const shortId = metadata.runId.length >= 6
      ? metadata.runId.slice(-6)
      : metadata.runId || 'unknown';
    return `${sanitize(metadata.caseType)}_${sanitize(metadata.exportPath)}_${date}_${shortId}.pdf`;
  } catch (err) {
    throw new ExportDocumentGenerationError({
      code: 'EXPORT_FILENAME_FAILED',
      message: `Filename generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      details: err,
    });
  }
}

/** Sanitize a string for use in filenames: lowercase, alphanumeric + underscores. */
function sanitize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
