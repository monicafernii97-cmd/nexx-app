import { describe, expect, it } from 'vitest';
import { detectDocumentReference } from '../documentReferenceDetection';
import { verifyPlainTextDocumentGrounding } from '../plainTextGrounding';

const sourcePackets = [{
  sourceId: 'source-1',
  fileId: 'file-1',
  fileName: 'Final Order.pdf',
  chunkId: 'chunk-1',
  pageStart: 12,
  pageEnd: 12,
  blockIds: [],
  text: 'The parties shall communicate only through AppClose regarding the health, education, and welfare of the child.',
}];

describe('plain-text document grounding', () => {
  it('verifies exact source language without rewriting the natural draft', () => {
    const message = 'For clarity, the order says we “shall communicate only through AppClose regarding the health, education, and welfare of the child.”';
    const result = verifyPlainTextDocumentGrounding({
      message,
      sourcePackets,
      documentReference: detectDocumentReference(
        'Using the exact language on page 12 of my uploaded order, draft a natural reply.',
      ),
    });

    expect(result.passed).toBe(true);
    expect(result.verifiedCitations).toHaveLength(1);
  });

  it('rejects an unsupported exact-order paraphrase so generation can retry', () => {
    const result = verifyPlainTextDocumentGrounding({
      message: 'The order gives me sole authority and you are not entitled to any further information.',
      sourcePackets,
      documentReference: detectDocumentReference(
        'Using the exact language on page 12 of my uploaded order, draft a natural reply.',
      ),
    });

    expect(result.passed).toBe(false);
    expect(result.errors[0]).toMatch(/unsupported exact-order proposition/i);
  });

  it('rejects a mixed draft that adds an unsupported legal claim after a supported quote', () => {
    const result = verifyPlainTextDocumentGrounding({
      message: 'We shall communicate only through AppClose. The order also gives me sole medical authority.',
      sourcePackets,
      documentReference: detectDocumentReference(
        'Using the exact language on page 12 of my uploaded order, draft a natural reply.',
      ),
    });

    expect(result.passed).toBe(false);
    expect(result.errors.join(' ')).toMatch(/sole medical authority/i);
  });

  it('rejects an inverse exact-order claim even when most words overlap', () => {
    const result = verifyPlainTextDocumentGrounding({
      message: 'The parties shall not communicate only through AppClose regarding the health, education, and welfare of the child.',
      sourcePackets,
      documentReference: detectDocumentReference(
        'Quote the exact language from my uploaded order.',
      ),
    });

    expect(result.passed).toBe(false);
    expect(result.errors.join(' ')).toMatch(/shall not communicate/i);
  });

  it('detects an unsupported cannot-access claim after supported language', () => {
    const result = verifyPlainTextDocumentGrounding({
      message: 'We shall communicate only through AppClose. You cannot access Amelia’s medical records.',
      sourcePackets,
      documentReference: detectDocumentReference(
        'Using the exact language in my uploaded order, draft a reply.',
      ),
    });

    expect(result.passed).toBe(false);
    expect(result.errors.join(' ')).toMatch(/cannot access/i);
  });

  it('rejects changing permissive may language into mandatory must language', () => {
    const result = verifyPlainTextDocumentGrounding({
      message: 'The parties must communicate only through AppClose regarding the child.',
      sourcePackets: [{
        ...sourcePackets[0],
        text: 'The parties may communicate only through AppClose regarding the child.',
      }],
      documentReference: detectDocumentReference('Quote the exact language from my uploaded order.'),
    });

    expect(result.passed).toBe(false);
    expect(result.errors.join(' ')).toMatch(/must communicate/i);
  });

  it('attaches negation to the matching source clause instead of an unrelated clause', () => {
    const result = verifyPlainTextDocumentGrounding({
      message: 'Father shall not have access to medical records.',
      sourcePackets: [{
        ...sourcePackets[0],
        text: 'Father shall have access to medical records and shall not disclose them to third parties.',
      }],
      documentReference: detectDocumentReference('Quote the exact language from my uploaded order.'),
    });

    expect(result.passed).toBe(false);
    expect(result.errors.join(' ')).toMatch(/shall not have access/i);
  });

  it('checks do-not-have-access language as a material order proposition', () => {
    const result = verifyPlainTextDocumentGrounding({
      message: 'We shall communicate only through AppClose. You do not have access to Amelia’s medical records.',
      sourcePackets,
      documentReference: detectDocumentReference(
        'Using the exact language in my uploaded order, draft a reply.',
      ),
    });

    expect(result.passed).toBe(false);
    expect(result.errors.join(' ')).toMatch(/do not have access/i);
  });

  it('does not impose citation checks on ordinary relational drafting', () => {
    const result = verifyPlainTextDocumentGrounding({
      message: 'Thanks for letting me know. I spoke with her after she came home.',
      sourcePackets: [],
      documentReference: detectDocumentReference('Can you make this reply sound more natural?'),
    });

    expect(result.passed).toBe(true);
  });
});
