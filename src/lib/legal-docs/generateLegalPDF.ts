/**
 * Legal PDF Orchestrator
 *
 * THE SINGLE AUTHORITY for all legal PDF generation.
 *
 * No route may manually parse, resolve profiles, render HTML,
 * render PDF, or validate PDF. This orchestrator owns the full
 * pipeline in this exact order:
 *
 *   1. parseLegalDocument
 *   2. classifyDocumentType
 *   3. loadCourtSettings
 *   4. resolveJurisdictionProfile (+ resolution metadata)
 *   5. DOCUMENT_TYPE_PROFILES lookup
 *   6. validateLegalDocument (blockers → throws)
 *   7. preflightLegalDocument (advisory)
 *   8. renderLegalDocumentHTML
 *   9. HTML sanity checks (length + structure)
 *  10. renderHTMLToPDF
 *  11. validatePdfBuffer (mandatory)
 *  12. generateLegalFilename
 *  13. return full result
 */

import { parseLegalDocument } from './parseLegalDocument';
import { classifyDocumentType, type DocumentType } from './classifyDocumentType';
import { DOCUMENT_TYPE_PROFILES, type DocumentTypeProfile } from './document-type/profiles';
import { validateLegalDocument, type ValidationResult } from './validateLegalDocument';
import { preflightLegalDocument, type LegalPreflight } from './preflightLegalDocument';
import { renderLegalDocumentHTML } from './renderLegalDocumentHTML';
import { generateLegalFilename } from './generateLegalFilename';
import { checkRenderedLegalStructure } from './assertRenderedLegalStructure';
import { LegalDocumentGenerationError } from './errors';
import {
  resolveJurisdictionProfileWithMeta,
  toCourtFormattingRules,
  type SavedCourtSettings,
} from './jurisdiction/resolveJurisdictionProfile';
import { loadCourtSettingsForPipeline } from './jurisdiction/loadCourtSettings';
import { renderHTMLToPDF } from '@/lib/pdf/renderHTMLToPDF';
import { validatePdfBuffer, type ValidatedPdf } from '@/lib/pdf/validatePdf';
import type { CourtSettings } from './jurisdiction/types';
import type { JurisdictionProfile, ProfileResolutionMeta } from '@/lib/jurisdiction/types';
import { assertQuickGenerateProfile } from '@/lib/jurisdiction/assertProfileForPipeline';
import type { LegalDocument } from './types';
import { logLegalGeneration } from './observability';

/** Minimum acceptable HTML output length — anything shorter indicates a rendering failure. */
const MIN_RENDERED_HTML_LENGTH = 200;

// Re-export for consumers
export type { ProfileResolutionSource, ProfileResolutionMeta } from '@/lib/jurisdiction/types';

// ═══════════════════════════════════════════════════════════════
// Public Types
// ═══════════════════════════════════════════════════════════════

export type GenerateLegalPDFParams = {
  /** Raw text content to parse into a legal document. */
  rawText: string;
  /** Async function to query Convex for saved court settings. */
  convexQuery: () => Promise<SavedCourtSettings>;
  /** Fallback court settings from request body. */
  payloadFallback?: Record<string, unknown> | null;
  /** Document-level settings override (highest priority). */
  documentOverride?: Partial<CourtSettings>;
  /** Fallback title when parser returns UNTITLED DOCUMENT. */
  fallbackTitle?: string;
};

export type GenerateLegalPDFResult = {
  /** Parsed legal document model. */
  parsed: LegalDocument;
  /** Classified document type. */
  documentType: DocumentType;
  /** Resolved court settings (from Convex + payload + override merge). */
  courtSettings: CourtSettings;
  /** Resolved jurisdiction formatting profile. */
  jurisdictionProfile: JurisdictionProfile;
  /** How the profile was selected — for observability. */
  profileResolutionMeta: ProfileResolutionMeta;
  /** Matched document type profile (structural expectations). */
  documentTypeProfile: DocumentTypeProfile;
  /** Structural validation result (blockers + warnings). */
  validation: ValidationResult;
  /** Advisory preflight result. */
  preflight: LegalPreflight;
  /** Rendered HTML string. */
  html: string;
  /** Generated PDF buffer. */
  pdfBuffer: Buffer;
  /** PDF validation metadata (byte length + SHA-256). */
  pdfMeta: ValidatedPdf;
  /** Deterministic filename for the PDF. */
  filename: string;
};

// ═══════════════════════════════════════════════════════════════
// Orchestrator
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a court-ready legal PDF from raw text.
 *
 * Composes the full canonical pipeline in a single call.
 * Every failure throws a typed `LegalDocumentGenerationError`.
 * No partial success is ever returned.
 *
 * @throws LegalDocumentGenerationError on any pipeline failure
 */
export async function generateLegalPDF(
  params: GenerateLegalPDFParams,
): Promise<GenerateLegalPDFResult> {
  const { rawText, convexQuery, payloadFallback, documentOverride, fallbackTitle } = params;
  const startTime = Date.now();

  // Capture partial metadata for failure telemetry
  let currentDocumentType: DocumentType | undefined;
  let currentProfileMeta: ProfileResolutionMeta | undefined;
  let currentSectionCount: number | undefined;

  try {
    // ── 1. Parse ──
    let rawParsed;
    try {
      rawParsed = parseLegalDocument(rawText);
    } catch (err) {
      throw new LegalDocumentGenerationError({
        code: 'LEGAL_DOCUMENT_PARSE_FAILED',
        message: `Legal document parsing failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        details: err,
      });
    }

    // ── 2. Classify ──
    let documentType;
    try {
      documentType = classifyDocumentType(rawParsed);
    } catch (err) {
      throw new LegalDocumentGenerationError({
        code: 'LEGAL_DOCUMENT_CLASSIFICATION_FAILED',
        message: `Document classification failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        details: err,
      });
    }
    currentDocumentType = documentType;

    // ── 3. Enrich parsed document (immutable) ──
    const parsed: LegalDocument = {
      ...rawParsed,
      title: {
        ...rawParsed.title,
        main: rawParsed.title.main === 'UNTITLED DOCUMENT' && fallbackTitle
          ? fallbackTitle
          : rawParsed.title.main,
      },
      metadata: {
        ...rawParsed.metadata,
        documentType,
      },
    };
    currentSectionCount = parsed.sections.length;

    // ── 4. Load court settings ──
    const courtSettings = await loadCourtSettingsForPipeline({
      convexQuery,
      payloadFallback,
      documentOverride,
    });

    // ── 5. Resolve jurisdiction profile ──
    let jurisdictionProfile: JurisdictionProfile;
    let profileResolutionMeta: ProfileResolutionMeta;
    try {
      const { profile, meta } = resolveJurisdictionProfileWithMeta(courtSettings);
      jurisdictionProfile = profile;
      profileResolutionMeta = meta;
    } catch (err) {
      throw new LegalDocumentGenerationError({
        code: 'LEGAL_DOCUMENT_PROFILE_RESOLUTION_FAILED',
        message: `Jurisdiction profile resolution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        details: err,
      });
    }
    currentProfileMeta = profileResolutionMeta;

    // ── 5b. Assert QG profile shape ──
    let qgProfile;
    try {
      qgProfile = assertQuickGenerateProfile(jurisdictionProfile);
    } catch (err) {
      throw new LegalDocumentGenerationError({
        code: 'LEGAL_DOCUMENT_PROFILE_RESOLUTION_FAILED',
        message: `Quick Generate profile assertion failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        details: err,
      });
    }

    // ── 6. Resolve document-type profile ──
    const documentTypeProfile = DOCUMENT_TYPE_PROFILES[documentType];

    // ── 7. Validate (blockers → throw) ──
    const validation = validateLegalDocument(parsed, qgProfile, documentTypeProfile);
    if (!validation.ok) {
      throw new LegalDocumentGenerationError({
        code: 'LEGAL_DOCUMENT_VALIDATION_FAILED',
        message: `Legal document validation failed: ${validation.blockers.join('; ')}`,
        details: validation,
      });
    }

    // ── 8. Preflight (advisory — never blocks) ──
    const preflight = preflightLegalDocument(parsed);

    // ── 9. Render HTML ──
    const html = renderLegalDocumentHTML(parsed, qgProfile, documentTypeProfile);

    // ── 10. HTML minimum length check ──
    if (html.length < MIN_RENDERED_HTML_LENGTH) {
      throw new LegalDocumentGenerationError({
        code: 'LEGAL_DOCUMENT_RENDER_TOO_SHORT',
        message: `Rendered HTML is ${html.length} chars (minimum ${MIN_RENDERED_HTML_LENGTH}) — possible rendering failure.`,
      });
    }

    // ── 11. HTML structural sanity check ──
    const missingStructure = checkRenderedLegalStructure(html);
    if (missingStructure.length > 0) {
      throw new LegalDocumentGenerationError({
        code: 'LEGAL_DOCUMENT_RENDER_STRUCTURE_INVALID',
        message: `Rendered HTML missing structural markers: ${missingStructure.join(', ')}`,
        details: missingStructure,
      });
    }

    // ── 12. Render PDF ──
    const formattingRules = toCourtFormattingRules(qgProfile);
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderHTMLToPDF(html, formattingRules, parsed.metadata.causeNumber);
    } catch (err) {
      throw new LegalDocumentGenerationError({
        code: 'LEGAL_DOCUMENT_PDF_RENDER_FAILED',
        message: `PDF rendering failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        details: err,
      });
    }

    // ── 13. Validate PDF buffer (mandatory — never skip) ──
    let pdfMeta: ValidatedPdf;
    try {
      pdfMeta = validatePdfBuffer(pdfBuffer);
    } catch (err) {
      throw new LegalDocumentGenerationError({
        code: 'LEGAL_DOCUMENT_PDF_INVALID',
        message: `PDF validation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        details: err,
      });
    }

    // ── 14. Generate filename ──
    let filename;
    try {
      filename = generateLegalFilename(parsed);
    } catch (err) {
      throw new LegalDocumentGenerationError({
        code: 'LEGAL_DOCUMENT_FILENAME_FAILED',
        message: `Filename generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        details: err,
      });
    }

    // ── Observability (success) ──
    const durationMs = Date.now() - startTime;
    logLegalGeneration({
      orchestrator: 'quick_generate',
      documentType,
      profileKey: profileResolutionMeta.profileKey,
      profileSource: profileResolutionMeta.source,
      sectionCount: parsed.sections.length,
      htmlLength: html.length,
      pdfByteLength: pdfMeta.byteLength,
      durationMs,
      success: true,
    });
    if (validation.warnings.length > 0) {
      console.warn(`[LegalPDF] Warnings: ${validation.warnings.join('; ')}`);
    }
    if (!preflight.ok) {
      console.warn(`[LegalPDF] Preflight: ${preflight.warnings.join('; ')}`);
    }

    return {
      parsed,
      documentType,
      courtSettings,
      jurisdictionProfile,
      profileResolutionMeta,
      documentTypeProfile,
      validation,
      preflight,
      html,
      pdfBuffer,
      pdfMeta,
      filename,
    };
  } catch (err) {
    // ── Observability (failure) ──
    const durationMs = Date.now() - startTime;
    const generationError = err instanceof LegalDocumentGenerationError
      ? err
      : new LegalDocumentGenerationError({
          code: 'LEGAL_DOCUMENT_PDF_RENDER_FAILED',
          message: err instanceof Error ? err.message : String(err),
          details: err,
        });

    logLegalGeneration({
      orchestrator: 'quick_generate',
      documentType: currentDocumentType ?? ('unknown' as DocumentType),
      profileKey: currentProfileMeta?.profileKey ?? 'unknown',
      profileSource: currentProfileMeta?.source ?? 'global_default',
      sectionCount: currentSectionCount,
      durationMs,
      success: false,
      errorCode: generationError.code,
    });

    throw generationError;
  }
}

// deriveProfileResolutionMeta — REMOVED
// Resolution metadata is now provided by the shared resolver
// (resolveSharedJurisdictionProfile) in @/lib/jurisdiction/.
