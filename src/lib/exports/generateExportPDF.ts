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
import type { ExportJurisdictionProfile } from '@/lib/jurisdiction/types';
import type { ProfileResolutionMeta } from '@/lib/jurisdiction/types';
import { logExportGeneration } from './observability';

// ── Quick Generate renderer (court_document path) ──────────────
import { renderLegalDocumentHTML } from '@/lib/legal-docs/renderLegalDocumentHTML';
import { toCourtFormattingRules as toQGFormattingRules } from '@/lib/legal-docs/jurisdiction/resolveJurisdictionProfile';
import {
  canonicalExportToLegalDocument,
  exportProfileToQuickGenerateProfile,
} from './canonicalExportToLegalDocument';
import {
  assertLegalDocumentIntegrity,
  LegalDocumentIntegrityError,
} from '@/lib/legal-docs/pipeline/assertLegalDocumentIntegrity';
import { auditCourtHTML } from './auditRenderedCourtDocument';
import type { CourtFormattingRules } from '@/lib/legal/types';
import type { CourtDocumentContext } from './canonicalExportToLegalDocument';
import { assertCourtDocumentFinalizable } from '@/lib/legal/engine/assertCourtDocumentFinalizable';

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
  /** Optional court document context from resolved identity. */
  courtContext?: CourtDocumentContext;
  /** Optional resolved title (from CourtIdentity) for filename generation. */
  resolvedTitle?: string;
  /** Metadata for filename generation. */
  metadata: {
    caseType: string;
    exportPath: string;
    runId: string;
  };
  /** Resolved court identity — required for finalization guard on court documents. */
  courtIdentity?: import('@/lib/exports/resolveCourtIdentity').CourtIdentity;
  /** Set to true for original petitions where no cause number exists yet. */
  isInitiatingFiling?: boolean;
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
  let resolvedProfileMeta: ProfileResolutionMeta | null = null;
  let resolvedExportPath = input.metadata.exportPath;

  try {
    // 1. Resolve jurisdiction profile (skip if pre-resolved)
    const { profile, meta: profileMeta } = input.resolvedProfile
      ? { profile: input.resolvedProfile, meta: { profileKey: input.resolvedProfile.key, source: 'pre_resolved' as const } }
      : resolveProfileStage(input.jurisdictionSettings);

    resolvedProfileMeta = profileMeta;

    // 2. Build canonical export document
    const document = adaptDocumentStage(input.adaptParams);
    resolvedExportPath = document.path;

    // 3. Validate document structure
    validateDocumentStage(document);

    let html: string;
    let pdfBuffer: Buffer;

    if (document.path === 'court_document') {
      // ── COURT DOCUMENTS: Route through Quick Generate renderer ──
      // 🔒 Hard integrity enforcement: fails = export blocked.

      const legalDoc = canonicalExportToLegalDocument(document, input.courtContext);

      // Hard integrity check — throws on any violation.
      // No advisory mode — court documents must be structurally correct.
      try {
        assertLegalDocumentIntegrity(legalDoc);
      } catch (err) {
        if (err instanceof LegalDocumentIntegrityError) {
          throw new ExportDocumentGenerationError({
            code: 'EXPORT_DOCUMENT_INTEGRITY_FAILED',
            message: `Court document integrity check failed: ${err.message}`,
            details: { rule: err.message },
          });
        }
        throw new ExportDocumentGenerationError({
          code: 'EXPORT_DOCUMENT_INTEGRITY_FAILED',
          message: `Unexpected integrity assertion failure: ${err instanceof Error ? err.name : 'Unknown error'}`,
          details: err,
        });
      }

      const qgProfile = exportProfileToQuickGenerateProfile(profile);

      html = renderLegalDocumentHTML(legalDoc, qgProfile);

      if (html.length < MIN_RENDERED_EXPORT_HTML_LENGTH) {
        throw new ExportDocumentGenerationError({
          code: 'EXPORT_RENDER_TOO_SHORT',
          message: `Rendered court HTML is ${html.length} chars (minimum ${MIN_RENDERED_EXPORT_HTML_LENGTH}) — possible rendering failure.`,
        });
      }

      // Post-render HTML audit — checks visible text for blocked patterns,
      // duplicate headings, signature mismatches, and metadata leaks.
      const htmlAudit = auditCourtHTML(html);
      if (!htmlAudit.passed) {
        const blockers = htmlAudit.violations
          .filter(v => v.severity === 'blocker')
          .map(v => `${v.rule}: ${v.detail}`);
        throw new ExportDocumentGenerationError({
          code: 'EXPORT_DOCUMENT_INTEGRITY_FAILED',
          message: `Court HTML audit failed: ${blockers.join('; ')}`,
          details: { violations: htmlAudit.violations },
        });
      }

      // ── FINALIZATION GUARD ──────────────────────────────────
      // Enforces the Legal Document Finalization Contract.
      // Runs AFTER HTML rendering, BEFORE PDF generation.
      // If the guard fails, NO PDF is generated.
      if (input.courtIdentity) {
        const guardResult = assertCourtDocumentFinalizable(
          html,
          input.courtIdentity,
          {
            exportPath: document.path,
            caseType: input.metadata.caseType,
            isInitiatingFiling: input.isInitiatingFiling,
          },
        );

        if (!guardResult.ok) {
          throw new ExportDocumentGenerationError({
            code: 'EXPORT_DOCUMENT_NOT_FINALIZABLE',
            message: `Document cannot be finalized: ${guardResult.errors.map(e => e.message).join('; ')}`,
            details: guardResult,
          });
        }
      }

      // Use QG's formatting rules for PDF rendering (page size, margins, footers)
      const formattingRules = toQGFormattingRules(qgProfile);
      pdfBuffer = await renderCourtPDFStage(html, formattingRules, input.causeNumber);
    } else {
      // ── NON-COURT EXPORTS: Use existing export renderers ──
      html = renderHTMLStage(document, profile);
      await assertStructureStage(html, document.path as ExportPath);
      pdfBuffer = await renderPDFStage(html, profile, input.causeNumber);
    }

    // 7. Validate PDF buffer
    const pdfMeta = validatePDFStage(pdfBuffer);

    // 7b. Assert metadata consistency — prevent caller/document identity drift
    if (input.metadata.exportPath !== document.path) {
      console.warn(
        `[ExportPDF] Metadata drift: metadata.exportPath="${input.metadata.exportPath}" vs document.path="${document.path}". Using document.path for filename.`,
      );
    }

    // 8. Generate deterministic filename
    // Court documents use resolvedTitle when available for a professional filename
    const filename = input.resolvedTitle && document.path === 'court_document'
      ? generateCourtFilename(input.resolvedTitle, input.metadata.runId)
      : generateExportFilename({
          ...input.metadata,
          exportPath: document.path,
        });

    const durationMs = Date.now() - startTime;

    // ── Observability ──
    logExportGeneration({
      orchestrator: 'create_export',
      runId: input.metadata.runId,
      exportPath: document.path,
      caseType: input.metadata.caseType,
      profileKey: profileMeta.profileKey,
      profileSource: profileMeta.source,
      htmlLength: html.length,
      pdfByteLength: pdfMeta.byteLength,
      durationMs,
      success: true,
    });

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
    logExportGeneration({
      orchestrator: 'create_export',
      runId: input.metadata.runId,
      exportPath: resolvedExportPath,
      caseType: input.metadata.caseType,
      profileKey: resolvedProfileMeta?.profileKey ?? 'unknown',
      profileSource: resolvedProfileMeta?.source ?? 'global_default',
      durationMs,
      success: false,
      errorCode: mapped.code,
    });
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
async function assertStructureStage(html: string, path: ExportPath): Promise<void> {
  try {
    await assertRenderedExportStructure(html, path);
  } catch (err) {
    throw new ExportDocumentGenerationError({
      code: 'EXPORT_RENDER_STRUCTURE_INVALID',
      message: `Export HTML structure check failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      details: err,
    });
  }
}

/** Stage 6: Render HTML to PDF via Puppeteer (export renderers). */
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

/** Stage 6 (court path): Render HTML to PDF using QG formatting rules. */
async function renderCourtPDFStage(
  html: string,
  rules: CourtFormattingRules,
  causeNumber?: string,
): Promise<Buffer> {
  try {
    return await renderHTMLToPDF(html, rules, causeNumber);
  } catch (err) {
    throw new ExportDocumentGenerationError({
      code: 'EXPORT_PDF_RENDER_FAILED',
      message: `Court PDF rendering failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
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
export function generateExportFilename(metadata: {
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

/**
 * Generate a court-specific filename from the resolved title.
 * Example: "Motion to Modify" → "motion_to_modify_2026-05-02_a1b2c3.pdf"
 */
function generateCourtFilename(resolvedTitle: string, runId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const shortId = runId.length >= 6 ? runId.slice(-6) : runId || 'unknown';
  const titleSlug = sanitize(resolvedTitle) || 'court_document';
  return `${titleSlug}_${date}_${shortId}.pdf`;
}
