/**
 * E-File-Safe Legal Filename Generator
 *
 * Rules:
 *   - Uppercase
 *   - Underscores only (no spaces, no special chars)
 *   - No apostrophes, parentheses, commas, smart quotes
 *   - Include cause number when available (preserve hyphens)
 *   - No timestamps, no "Unknown"
 *
 * Example output:
 *   PETITIONERS_SECOND_AMENDED_MOTION_FOR_TEMPORARY_ORDERS_20-DCV-271717.pdf
 */

import type { LegalDocument } from './types';

export function generateLegalFilename(doc: LegalDocument): string {
  const title = sanitizeSegment(doc.title.main || 'LEGAL_DOCUMENT');
  const cause = sanitizeCauseNumber(doc.metadata.causeNumber);

  const base = cause ? `${title}_${cause}` : title;
  return `${base}.pdf`;
}

/** Sanitize a title segment for efile-safe naming. */
function sanitizeSegment(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[''\u2018\u2019]/g, '')        // strip apostrophes + smart quotes
    .replace(/[""]/g, '')                     // strip double smart quotes
    .replace(/[()]/g, '')                     // strip parentheses
    .replace(/&/g, 'AND')                     // ampersand → AND
    .replace(/[^\w\s]/g, ' ')                // non-word chars (incl. hyphens) → space
    .replace(/\s+/g, '_')                     // spaces → underscore
    .replace(/_+/g, '_')                      // collapse multiple underscores
    .replace(/^_+|_+$/g, '')                  // trim leading/trailing underscores
    .toUpperCase();
}

/** Sanitize a cause number, preserving hyphens. */
function sanitizeCauseNumber(input?: string): string {
  if (!input) return '';
  return input
    .normalize('NFKD')
    .replace(/[^\w-]/g, '')
    .toUpperCase();
}
