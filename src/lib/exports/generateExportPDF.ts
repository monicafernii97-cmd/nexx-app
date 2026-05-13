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
import { extractSapcrChildNameRobust } from './extractCourtMetadataFromText';

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
  /** Source text used for final identity recovery in court-document exports. */
  identitySourceText?: string;
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
  /** Human-readable document title for the completion UI. */
  documentTitle: string;
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

      let legalDoc = canonicalExportToLegalDocument(document, input.courtContext);
      let courtIdentityForFinalization = input.courtIdentity;
      const recoveredSapcrChildName = recoverSapcrChildNameForIntegrity(input, legalDoc);
      if (recoveredSapcrChildName && legalDoc.caption) {
        legalDoc = {
          ...legalDoc,
          caption: {
            ...legalDoc.caption,
            leftLines: [
              'IN THE INTEREST OF',
              recoveredSapcrChildName.toUpperCase(),
              'A CHILD',
            ],
          },
        };
        if (courtIdentityForFinalization) {
          courtIdentityForFinalization = {
            ...courtIdentityForFinalization,
            childrenNames: [recoveredSapcrChildName],
            children: courtIdentityForFinalization.children?.length
              ? courtIdentityForFinalization.children
              : [{ name: recoveredSapcrChildName, age: 0 }],
          };
        }
      }

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
      if (!courtIdentityForFinalization) {
        throw new ExportDocumentGenerationError({
          code: 'EXPORT_DOCUMENT_NOT_FINALIZABLE',
          message: 'Document cannot be finalized: resolved court identity is required for court-document export.',
          details: { readiness: 'blocked_missing_required_fields', missing: ['courtIdentity'] },
        });
      }

      const guardResult = assertCourtDocumentFinalizable(
        html,
        courtIdentityForFinalization,
        {
          exportPath: document.path,
          caseType: courtIdentityForFinalization.caseType || input.metadata.caseType,
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

    // 8. Generate deterministic title + filename.
    const titleSource = input.resolvedTitle && document.path === 'court_document'
      ? input.resolvedTitle
      : document.title || getFallbackDocumentTitle(document.path);
    const documentTitle = generateExportDisplayTitle(titleSource);
    const filename = generateFilenameFromTitle(documentTitle);

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
      documentTitle,
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

function recoverSapcrChildNameForIntegrity(
  input: GenerateExportPDFInput,
  legalDoc: ReturnType<typeof canonicalExportToLegalDocument>,
): string | undefined {
  const caption = legalDoc.caption;
  if (!caption) return undefined;

  const leftText = caption.leftLines.join(' ');
  if (!/IN THE INTEREST OF/i.test(leftText)) return undefined;

  const childNameLines = caption.leftLines.filter((line) => {
    const trimmed = line.trim();
    return trimmed !== '' && !/^(IN THE INTEREST OF|A CHILD|CHILDREN)$/i.test(trimmed);
  });
  if (childNameLines.length > 0) return undefined;

  const identityChildName = input.courtIdentity?.childrenNames?.find((name) => name.trim());
  if (identityChildName) return identityChildName.trim();

  const profileChildName = input.courtIdentity?.children?.find((child) => child.name.trim())?.name;
  if (profileChildName) return profileChildName.trim();

  const draftedText = input.adaptParams.draftedSections.map((section) =>
    [
      section.heading,
      section.body,
      ...(section.numberedItems ?? []),
    ].filter(Boolean).join('\n'),
  ).join('\n');

  const captionText = input.adaptParams.caption
    ? [
      input.adaptParams.caption.causeLine,
      ...input.adaptParams.caption.leftLines,
      ...input.adaptParams.caption.centerLines,
      ...input.adaptParams.caption.rightLines,
    ].filter(Boolean).join('\n')
    : '';

  const recoveryText = [
    input.identitySourceText,
    legalDoc.rawText,
    captionText,
    draftedText,
  ].filter(Boolean).join('\n');

  const recovered = extractSapcrChildNameRobust(recoveryText);
  if (!recovered) {
    console.error('[generateExportPDF] SAPCR final recovery failed', {
      identitySourceTextLength: input.identitySourceText?.length ?? 0,
      legalDocRawTextLength: legalDoc.rawText?.length ?? 0,
      captionTextLength: captionText.length,
      draftedTextLength: draftedText.length,
      recoveryTextLength: recoveryText.length,
      identitySourceHasInterestPhrase: /IN\s+THE\s+INTEREST\s+OF/i.test(input.identitySourceText ?? ''),
      legalDocRawHasInterestPhrase: /IN\s+THE\s+INTEREST\s+OF/i.test(legalDoc.rawText ?? ''),
      captionTextHasInterestPhrase: /IN\s+THE\s+INTEREST\s+OF/i.test(captionText),
      draftedTextHasInterestPhrase: /IN\s+THE\s+INTEREST\s+OF/i.test(draftedText),
      courtIdentityChildrenNamesCount: input.courtIdentity?.childrenNames?.length ?? 0,
      courtIdentityChildrenCount: input.courtIdentity?.children?.length ?? 0,
      captionLeftLineCount: caption.leftLines.length,
      captionRightLineCount: caption.rightLines.length,
      adaptCaptionLeftLineCount: input.adaptParams.caption?.leftLines.length ?? 0,
    });
  }

  return recovered;
}

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
    const title = generateExportDisplayTitle(`${metadata.caseType} ${metadata.exportPath}`);
    return generateFilenameFromTitle(title);
  } catch (err) {
    throw new ExportDocumentGenerationError({
      code: 'EXPORT_FILENAME_FAILED',
      message: `Filename generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      details: err,
    });
  }
}

/** Generate a title-cased display title for the completed export. */
export function generateExportDisplayTitle(title: string): string {
  const normalized = title
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return (normalized || 'Generated Document')
    .toLowerCase()
    .split(' ')
    .map((word) => word.replace(/^[a-z0-9]/, (char) => char.toUpperCase()))
    .join(' ')
    .replace(/(['’])S\b/g, '$1s');
}

/** Sanitize a string for use in filenames: lowercase, alphanumeric + underscores. */
function sanitize(str: string): string {
  return str
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Generate a clean snake_case PDF filename from the smart title.
 * Example: "Motion to Modify" -> "motion_to_modify.pdf"
 */
export function generateFilenameFromTitle(title: string): string {
  return `${sanitize(title) || 'generated_document'}.pdf`;
}

/** Provide a human fallback when a canonical document has no title. */
function getFallbackDocumentTitle(path: ExportPath): string {
  switch (path) {
    case 'court_document':
      return 'Court Document';
    case 'case_summary':
      return 'Summary Report';
    case 'exhibit_document':
      return 'Exhibit Packet';
    case 'timeline_summary':
      return 'Timeline Summary';
    case 'incident_report':
      return 'Incident Report';
    default:
      return 'Generated Document';
  }
}
