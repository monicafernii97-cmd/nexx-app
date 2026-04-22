/**
 * Document-Type Profiles
 *
 * Per-type rules defining which structural sections are expected
 * for each kind of legal document. Used by validateLegalDocument()
 * to drive conditional validation (warnings vs blockers).
 *
 * These profiles are structural metadata — they do NOT control
 * jurisdiction formatting (that's JurisdictionProfile's job).
 */

import type { DocumentType } from '../classifyDocumentType';

// ═══════════════════════════════════════════════════════════════
// Profile Type
// ═══════════════════════════════════════════════════════════════

export type DocumentTypeProfile = {
  /** Whether this document type requires a PRAYER / WHEREFORE block. */
  requiresPrayer: boolean;
  /** Whether this document type allows a Certificate of Service. */
  allowsCertificate: boolean;
  /** Whether this document type requires a signature block. */
  requiresSignature: boolean;
  /** Whether this document type requires a verification/declaration block. */
  requiresVerification: boolean;
  /** Preferred heading casing for this document type. */
  preferredHeadingCase: 'upper' | 'natural';
  /** Whether relief requests should be split into a numbered list. */
  splitReliefRequestsIntoList: boolean;
};

// ═══════════════════════════════════════════════════════════════
// Profiles
// ═══════════════════════════════════════════════════════════════

export const DOCUMENT_TYPE_PROFILES: Record<DocumentType, DocumentTypeProfile> = {
  motion: {
    requiresPrayer: true,
    allowsCertificate: true,
    requiresSignature: true,
    requiresVerification: false,
    preferredHeadingCase: 'upper',
    splitReliefRequestsIntoList: true,
  },
  petition: {
    requiresPrayer: true,
    allowsCertificate: true,
    requiresSignature: true,
    requiresVerification: false,
    preferredHeadingCase: 'upper',
    splitReliefRequestsIntoList: true,
  },
  response: {
    requiresPrayer: false,
    allowsCertificate: true,
    requiresSignature: true,
    requiresVerification: false,
    preferredHeadingCase: 'upper',
    splitReliefRequestsIntoList: false,
  },
  notice: {
    requiresPrayer: false,
    allowsCertificate: true,
    requiresSignature: true,
    requiresVerification: false,
    preferredHeadingCase: 'upper',
    splitReliefRequestsIntoList: false,
  },
  affidavit: {
    requiresPrayer: false,
    allowsCertificate: false,
    requiresSignature: true,
    requiresVerification: true,
    preferredHeadingCase: 'natural',
    splitReliefRequestsIntoList: false,
  },
  declaration: {
    requiresPrayer: false,
    allowsCertificate: false,
    requiresSignature: true,
    requiresVerification: true,
    preferredHeadingCase: 'natural',
    splitReliefRequestsIntoList: false,
  },
  order: {
    requiresPrayer: false,
    allowsCertificate: false,
    requiresSignature: false,
    requiresVerification: false,
    preferredHeadingCase: 'upper',
    splitReliefRequestsIntoList: false,
  },
  complaint: {
    requiresPrayer: true,
    allowsCertificate: true,
    requiresSignature: true,
    requiresVerification: false,
    preferredHeadingCase: 'upper',
    splitReliefRequestsIntoList: true,
  },
  answer: {
    requiresPrayer: false,
    allowsCertificate: true,
    requiresSignature: true,
    requiresVerification: false,
    preferredHeadingCase: 'upper',
    splitReliefRequestsIntoList: false,
  },
  request: {
    requiresPrayer: false,
    allowsCertificate: true,
    requiresSignature: true,
    requiresVerification: false,
    preferredHeadingCase: 'upper',
    splitReliefRequestsIntoList: true,
  },
  unknown: {
    requiresPrayer: false,
    allowsCertificate: true,
    requiresSignature: true,
    requiresVerification: false,
    preferredHeadingCase: 'upper',
    splitReliefRequestsIntoList: false,
  },
};
