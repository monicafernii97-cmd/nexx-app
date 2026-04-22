/**
 * Document Type Classification Regression Tests
 *
 * Locks down that classifyDocumentType() correctly classifies
 * all 11 document types from title text, and that
 * DOCUMENT_TYPE_PROFILES maps each type to correct structural expectations.
 */

import { describe, it, expect } from 'vitest';
import { classifyDocumentType, type DocumentType } from '../classifyDocumentType';
import { DOCUMENT_TYPE_PROFILES } from '../document-type/profiles';
import type { LegalDocument } from '../types';

/** Build a minimal LegalDocument with a given title for classification testing. */
function docWithTitle(main: string): LegalDocument {
  return {
    metadata: {},
    caption: null,
    title: { main },
    introBlocks: [],
    sections: [],
    prayer: null,
    signature: null,
    certificate: null,
    verification: null,
    rawText: '',
  };
}

describe('classifyDocumentType — title keyword classification', () => {
  const cases: Array<[string, DocumentType]> = [
    ['MOTION FOR TEMPORARY ORDERS', 'motion'],
    ['PETITIONER\'S MOTION TO MODIFY', 'motion'],
    ['PETITION TO MODIFY PARENT-CHILD RELATIONSHIP', 'petition'],
    ['ORIGINAL PETITION FOR DIVORCE', 'petition'],
    ['RESPONSE TO MOTION FOR TEMPORARY ORDERS', 'response'],
    ['NOTICE OF HEARING', 'notice'],
    ['AFFIDAVIT OF MONICA FERNANDEZ', 'affidavit'],
    ['DECLARATION OF JANE DOE', 'declaration'],
    ['UNSWORN DECLARATION UNDER PENALTY OF PERJURY', 'declaration'],
    ['ORDER GRANTING TEMPORARY ORDERS', 'order'],
    ['COMPLAINT FOR DAMAGES', 'complaint'],
    ['ANSWER TO ORIGINAL PETITION', 'answer'],
    ['REQUEST FOR PRODUCTION OF DOCUMENTS', 'request'],
    ['SOME RANDOM FILING', 'unknown'],
    ['UNTITLED DOCUMENT', 'unknown'],
  ];

  it.each(cases)('classifies "%s" as %s', (title, expected) => {
    const doc = docWithTitle(title);
    expect(classifyDocumentType(doc)).toBe(expected);
  });

  it('handles empty title', () => {
    expect(classifyDocumentType(docWithTitle(''))).toBe('unknown');
  });

  it('handles mixed case', () => {
    expect(classifyDocumentType(docWithTitle('Motion for Summary Judgment'))).toBe('motion');
  });
});

describe('DOCUMENT_TYPE_PROFILES — structural expectations', () => {
  it('has profiles for all 11 document types', () => {
    const expectedTypes: DocumentType[] = [
      'motion', 'petition', 'response', 'notice', 'affidavit',
      'declaration', 'order', 'complaint', 'answer', 'request', 'unknown',
    ];

    for (const type of expectedTypes) {
      expect(DOCUMENT_TYPE_PROFILES[type]).toBeDefined();
    }
  });

  it('motion requires prayer and signature', () => {
    const profile = DOCUMENT_TYPE_PROFILES['motion'];
    expect(profile.requiresPrayer).toBe(true);
    expect(profile.requiresSignature).toBe(true);
    expect(profile.requiresVerification).toBe(false);
  });

  it('affidavit requires verification but not prayer', () => {
    const profile = DOCUMENT_TYPE_PROFILES['affidavit'];
    expect(profile.requiresPrayer).toBe(false);
    expect(profile.requiresVerification).toBe(true);
    expect(profile.requiresSignature).toBe(true);
  });

  it('declaration requires verification but not prayer', () => {
    const profile = DOCUMENT_TYPE_PROFILES['declaration'];
    expect(profile.requiresPrayer).toBe(false);
    expect(profile.requiresVerification).toBe(true);
  });

  it('order does not require signature or prayer', () => {
    const profile = DOCUMENT_TYPE_PROFILES['order'];
    expect(profile.requiresPrayer).toBe(false);
    expect(profile.requiresSignature).toBe(false);
    expect(profile.requiresVerification).toBe(false);
  });

  it('petition requires prayer and allows certificate', () => {
    const profile = DOCUMENT_TYPE_PROFILES['petition'];
    expect(profile.requiresPrayer).toBe(true);
    expect(profile.allowsCertificate).toBe(true);
    expect(profile.splitReliefRequestsIntoList).toBe(true);
  });

  it('complaint requires prayer and allows certificate', () => {
    const profile = DOCUMENT_TYPE_PROFILES['complaint'];
    expect(profile.requiresPrayer).toBe(true);
    expect(profile.allowsCertificate).toBe(true);
  });
});
