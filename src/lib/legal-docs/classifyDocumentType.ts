/**
 * Legal Document Type Classifier
 *
 * Classifies a parsed LegalDocument into a document type
 * based on title keyword matching. Deterministic — no AI.
 *
 * Used by:
 *  - generateLegalPDF() orchestrator
 *  - validateLegalDocument() for conditional validation
 *  - DocumentTypeProfile lookup
 */

import type { LegalDocument } from './types';

// ═══════════════════════════════════════════════════════════════
// Document Types
// ═══════════════════════════════════════════════════════════════

export type DocumentType =
  | 'motion'
  | 'petition'
  | 'response'
  | 'notice'
  | 'affidavit'
  | 'declaration'
  | 'order'
  | 'complaint'
  | 'answer'
  | 'request'
  | 'unknown';

// ═══════════════════════════════════════════════════════════════
// Classification
// ═══════════════════════════════════════════════════════════════

/**
 * Keyword patterns ordered by specificity.
 * More specific patterns (e.g. "affidavit") must precede
 * broader ones (e.g. "motion") to avoid misclassification.
 */
const PATTERNS: Array<{ type: DocumentType; re: RegExp }> = [
  { type: 'affidavit', re: /\bAFFIDAVIT\b/i },
  { type: 'declaration', re: /\bDECLARATION\b/i },
  { type: 'complaint', re: /\bCOMPLAINT\b/i },
  { type: 'answer', re: /\bANSWER\b/i },
  { type: 'response', re: /\bRESPONSE\b/i },
  { type: 'petition', re: /\bPETITION\b/i },
  { type: 'notice', re: /\bNOTICE\b/i },
  { type: 'order', re: /\bORDER\b/i },
  { type: 'request', re: /\bREQUEST\b/i },
  // Motion last among broad terms — many docs have "motion" in the title
  { type: 'motion', re: /\bMOTION\b/i },
];

/**
 * Classify document type from a parsed LegalDocument title.
 *
 * @param doc - Parsed LegalDocument from parseLegalDocument()
 * @returns The classified DocumentType
 */
export function classifyDocumentType(doc: LegalDocument): DocumentType {
  const title = doc.title.main || '';

  for (const { type, re } of PATTERNS) {
    if (re.test(title)) {
      return type;
    }
  }

  return 'unknown';
}
