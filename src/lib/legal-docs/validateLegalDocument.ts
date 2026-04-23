/**
 * Legal Document Validator
 *
 * Runs structural + document-type-aware + jurisdiction-aware
 * checks on a parsed LegalDocument before rendering.
 *
 * Returns two levels:
 *   - blockers: prevent render (title missing, no body)
 *   - warnings: log but don't block (missing optional sections)
 *
 * Replaces the thin preflightLegalDocument for Quick Generate.
 */

import type { LegalDocument } from './types';
import type { QuickGenerateProfile as JurisdictionProfile } from './jurisdiction/types';
import type { DocumentTypeProfile } from './document-type/profiles';

// ═══════════════════════════════════════════════════════════════
// Result Type
// ═══════════════════════════════════════════════════════════════

export type ValidationResult = {
  /** True when no blockers exist. Warnings alone don't block. */
  ok: boolean;
  /** Non-critical issues — logged but don't prevent rendering. */
  warnings: string[];
  /** Critical issues — must be resolved before rendering. */
  blockers: string[];
};

// ═══════════════════════════════════════════════════════════════
// Validator
// ═══════════════════════════════════════════════════════════════

/**
 * Validate a parsed legal document against jurisdiction and
 * document-type expectations.
 *
 * @param doc - Parsed LegalDocument from parseLegalDocument()
 * @param jurisdictionProfile - Resolved JurisdictionProfile
 * @param documentTypeProfile - Resolved DocumentTypeProfile
 * @returns ValidationResult with ok, warnings, and blockers
 */
export function validateLegalDocument(
  doc: LegalDocument,
  jurisdictionProfile: JurisdictionProfile,
  documentTypeProfile: DocumentTypeProfile,
): ValidationResult {
  const warnings: string[] = [];
  const blockers: string[] = [];

  // ── Blockers ──
  if (!doc.title.main || doc.title.main === 'UNTITLED DOCUMENT') {
    blockers.push('Document title missing.');
  }

  if (!doc.sections.length && !doc.introBlocks.length) {
    blockers.push('No body content detected.');
  }

  // ── Document-type warnings ──
  if (documentTypeProfile.requiresPrayer && !doc.prayer) {
    warnings.push('Expected prayer block was not detected.');
  }

  if (documentTypeProfile.requiresSignature && !doc.signature) {
    warnings.push('Expected signature block was not detected.');
  }

  if (documentTypeProfile.requiresVerification && !doc.verification) {
    warnings.push('Expected verification block was not detected.');
  }

  // ── Jurisdiction warnings ──
  if (jurisdictionProfile.caption.useThreeColumnTable && !doc.caption) {
    warnings.push('Jurisdiction expects captioned pleading format, but caption was not detected.');
  }

  if (documentTypeProfile.allowsCertificate && !doc.certificate) {
    // Only warn if the document type typically includes a certificate
    warnings.push('Certificate of Service not detected — if present, jurisdiction renders it on a separate page.');
  }

  return {
    ok: blockers.length === 0,
    warnings,
    blockers,
  };
}
