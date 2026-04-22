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
  resolveJurisdictionProfile,
  toCourtFormattingRules,
  type SavedCourtSettings,
} from './jurisdiction/resolveJurisdictionProfile';
import { loadCourtSettingsForPipeline } from './jurisdiction/loadCourtSettings';
import { renderHTMLToPDF } from '@/lib/pdf/renderHTMLToPDF';
import { validatePdfBuffer, type ValidatedPdf } from '@/lib/pdf/validatePdf';
import type { CourtSettings, JurisdictionProfile } from './jurisdiction/types';
import type { LegalDocument } from './types';

/** Minimum acceptable HTML output length — anything shorter indicates a rendering failure. */
const MIN_RENDERED_HTML_LENGTH = 200;

// ═══════════════════════════════════════════════════════════════
// Profile Resolution Metadata
// ═══════════════════════════════════════════════════════════════

/** How the jurisdiction profile was resolved — for observability and debugging. */
export type ProfileResolutionSource =
  | 'court_exact_match'
  | 'state_fallback_unmatched_county'
  | 'state_default'
  | 'global_default';

export type ProfileResolutionMeta = {
  profileKey: string;
  source: ProfileResolutionSource;
};

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

  // ── 1. Parse ──
  const rawParsed = parseLegalDocument(rawText);

  // ── 2. Classify ──
  const documentType = classifyDocumentType(rawParsed);

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

  // ── 4. Load court settings ──
  const courtSettings = await loadCourtSettingsForPipeline({
    convexQuery,
    payloadFallback,
    documentOverride,
  });

  // ── 5. Resolve jurisdiction profile ──
  const jurisdictionProfile = resolveJurisdictionProfile(courtSettings);
  const profileResolutionMeta = deriveProfileResolutionMeta(jurisdictionProfile, courtSettings);

  // ── 6. Resolve document-type profile ──
  const documentTypeProfile = DOCUMENT_TYPE_PROFILES[documentType];

  // ── 7. Validate (blockers → throw) ──
  const validation = validateLegalDocument(parsed, jurisdictionProfile, documentTypeProfile);
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
  const html = renderLegalDocumentHTML(parsed, jurisdictionProfile, documentTypeProfile);

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
  const formattingRules = toCourtFormattingRules(jurisdictionProfile);
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
  const filename = generateLegalFilename(parsed);

  // ── Observability ──
  const durationMs = Date.now() - startTime;
  console.log(
    `[LegalPDF] Generated: type=${documentType}, profile=${profileResolutionMeta.profileKey} (${profileResolutionMeta.source}), ` +
    `sections=${parsed.sections.length}, html=${html.length}ch, pdf=${pdfMeta.byteLength}b, ` +
    `file="${filename}", duration=${durationMs}ms`,
  );
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
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Derive profile resolution metadata from the selected profile
 * and the court settings that were used to select it.
 */
function deriveProfileResolutionMeta(
  profile: JurisdictionProfile,
  settings: CourtSettings,
): ProfileResolutionMeta {
  let source: ProfileResolutionSource = 'global_default';

  if (profile.key === 'us-default') {
    source = 'global_default';
  } else if (profile.county) {
    // County-specific profile (e.g. tx-fort-bend-387th)
    source = 'court_exact_match';
  } else if (profile.state && settings.jurisdiction?.county) {
    // County was provided but no county-specific profile exists — fall back to state
    source = 'state_fallback_unmatched_county';
  } else if (profile.state) {
    source = 'state_default';
  }

  return {
    profileKey: profile.key,
    source,
  };
}
