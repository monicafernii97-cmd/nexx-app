/**
 * Preflight Legal Document Validator
 *
 * Runs structural checks on a parsed LegalDocument before rendering.
 * Surfaces warnings for missing expected sections.
 *
 * Does NOT block generation — only logs and returns warnings.
 * Use for observability and export metadata.
 */

import type { LegalDocument } from './types';

export type LegalPreflight = {
  ok: boolean;
  warnings: string[];
};

/**
 * Check a parsed document for missing required sections.
 *
 * @param doc - Parsed LegalDocument from parseLegalDocument()
 * @returns Preflight result with ok status and any warnings
 */
export function preflightLegalDocument(doc: LegalDocument): LegalPreflight {
  const warnings: string[] = [];

  if (!doc.caption) {
    warnings.push('Caption block not detected.');
  }

  if (!doc.title.main || doc.title.main === 'UNTITLED DOCUMENT') {
    warnings.push('Document title not detected.');
  }

  if (!doc.sections.length) {
    warnings.push('No body sections detected.');
  }

  if (!doc.prayer) {
    warnings.push('Prayer section not detected.');
  }

  if (!doc.signature) {
    warnings.push('Signature block not detected.');
  }

  if (!doc.certificate) {
    warnings.push('Certificate of Service not detected.');
  }

  return {
    ok: warnings.length === 0,
    warnings,
  };
}
