/**
 * Legal PDF Orchestrator
 *
 * Single-call entry point composing the full canonical pipeline:
 *
 *   parseLegalDocument
 *     → classifyDocumentType
 *     → loadCourtSettings
 *     → resolveJurisdictionProfile
 *     → DOCUMENT_TYPE_PROFILES lookup
 *     → validateLegalDocument
 *     → renderLegalDocumentHTML
 *     → renderHTMLToPDF
 *     → generateLegalFilename
 *
 * Callers (e.g. the Quick Generate route) should use this
 * instead of wiring the pipeline inline.
 */

import { parseLegalDocument } from './parseLegalDocument';
import { classifyDocumentType, type DocumentType } from './classifyDocumentType';
import { DOCUMENT_TYPE_PROFILES, type DocumentTypeProfile } from './document-type/profiles';
import { validateLegalDocument, type ValidationResult } from './validateLegalDocument';
import { renderLegalDocumentHTML } from './renderLegalDocumentHTML';
import { generateLegalFilename } from './generateLegalFilename';
import {
  resolveJurisdictionProfile,
  toCourtFormattingRules,
  type SavedCourtSettings,
} from './jurisdiction/resolveJurisdictionProfile';
import { loadCourtSettingsForPipeline } from './jurisdiction/loadCourtSettings';
import { renderHTMLToPDF } from '@/lib/pdf/renderHTMLToPDF';
import type { CourtSettings } from './jurisdiction/types';
import type { JurisdictionProfile } from './jurisdiction/types';
import type { LegalDocument } from './types';

/** Minimum acceptable HTML output length — anything shorter indicates a rendering failure. */
const MIN_RENDERED_HTML_LENGTH = 200;

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
  parsed: LegalDocument;
  documentType: DocumentType;
  courtSettings: CourtSettings;
  jurisdictionProfile: JurisdictionProfile;
  documentTypeProfile: DocumentTypeProfile;
  validation: ValidationResult;
  html: string;
  pdfBuffer: Buffer;
  filename: string;
};

// ═══════════════════════════════════════════════════════════════
// Orchestrator
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a court-ready legal PDF from raw text.
 *
 * Composes the full canonical 4-layer pipeline in a single call:
 * parse → classify → load settings → resolve profile → validate →
 * render HTML → render PDF → generate filename.
 *
 * @throws Error when validation blockers exist (title missing, no body)
 * @throws Error when HTML output is shorter than MIN_RENDERED_HTML_LENGTH chars
 */
export async function generateLegalPDF(
  params: GenerateLegalPDFParams,
): Promise<GenerateLegalPDFResult> {
  const { rawText, convexQuery, payloadFallback, documentOverride, fallbackTitle } = params;

  // ── 1. Parse ──
  const rawParsed = parseLegalDocument(rawText);

  // ── 2. Enrich parsed document (immutable) ──
  const documentType = classifyDocumentType(rawParsed);
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

  // ── 3. Load court settings ──
  const courtSettings = await loadCourtSettingsForPipeline({
    convexQuery,
    payloadFallback,
    documentOverride,
  });

  // ── 4. Resolve jurisdiction profile ──
  const jurisdictionProfile = resolveJurisdictionProfile(courtSettings);

  // ── 5. Resolve document-type profile ──
  const documentTypeProfile = DOCUMENT_TYPE_PROFILES[documentType];

  // ── 6. Validate ──
  const validation = validateLegalDocument(parsed, jurisdictionProfile, documentTypeProfile);
  if (!validation.ok) {
    throw new Error(
      `Legal document validation failed: ${validation.blockers.join('; ')}`,
    );
  }

  // ── 7. Render HTML ──
  const html = renderLegalDocumentHTML(parsed, jurisdictionProfile, documentTypeProfile);
  if (html.length < MIN_RENDERED_HTML_LENGTH) {
    throw new Error(`Rendered HTML is suspiciously short (${html.length} chars, minimum ${MIN_RENDERED_HTML_LENGTH}) — possible rendering failure.`);
  }

  // ── 8. Render PDF ──
  const formattingRules = toCourtFormattingRules(jurisdictionProfile);
  const pdfBuffer = await renderHTMLToPDF(html, formattingRules, parsed.metadata.causeNumber);

  // ── 9. Generate filename ──
  const filename = generateLegalFilename(parsed);

  return {
    parsed,
    documentType,
    courtSettings,
    jurisdictionProfile,
    documentTypeProfile,
    validation,
    html,
    pdfBuffer,
    filename,
  };
}
