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
 * @throws Error when HTML output is too short (< 200 chars)
 */
export async function generateLegalPDF(
  params: GenerateLegalPDFParams,
): Promise<GenerateLegalPDFResult> {
  const { rawText, convexQuery, payloadFallback, documentOverride, fallbackTitle } = params;

  // ── 1. Parse ──
  const parsed = parseLegalDocument(rawText);

  // ── 2. Apply fallback title ──
  if (parsed.title.main === 'UNTITLED DOCUMENT' && fallbackTitle) {
    parsed.title.main = fallbackTitle;
  }

  // ── 3. Classify document type ──
  const documentType = classifyDocumentType(parsed);
  parsed.metadata.documentType = documentType;

  // ── 4. Load court settings ──
  const courtSettings = await loadCourtSettingsForPipeline({
    convexQuery,
    payloadFallback,
    documentOverride,
  });

  // ── 5. Resolve jurisdiction profile ──
  const jurisdictionProfile = resolveJurisdictionProfile(courtSettings);

  // ── 6. Resolve document-type profile ──
  const documentTypeProfile = DOCUMENT_TYPE_PROFILES[documentType];

  // ── 7. Validate ──
  const validation = validateLegalDocument(parsed, jurisdictionProfile, documentTypeProfile);
  if (!validation.ok) {
    throw new Error(
      `Legal document validation failed: ${validation.blockers.join('; ')}`,
    );
  }

  // ── 8. Render HTML ──
  const html = renderLegalDocumentHTML(parsed, jurisdictionProfile, documentTypeProfile);
  if (html.length < 200) {
    throw new Error('Rendered HTML is suspiciously short — possible rendering failure.');
  }

  // ── 9. Render PDF ──
  const formattingRules = toCourtFormattingRules(jurisdictionProfile);
  const pdfBuffer = await renderHTMLToPDF(html, formattingRules, parsed.metadata.causeNumber);

  // ── 10. Generate filename ──
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
