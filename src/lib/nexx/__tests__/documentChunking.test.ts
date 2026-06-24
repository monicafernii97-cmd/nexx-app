import { describe, expect, it } from 'vitest';
import { buildDocumentMemoryArtifacts, DOCUMENT_CHUNKING_VERSION } from '../documentChunking';

describe('buildDocumentMemoryArtifacts', () => {
  it('creates a synthetic page and retrieval chunk for short extracted text', () => {
    const result = buildDocumentMemoryArtifacts('TEMPORARY ORDERS\n\nThe parties shall exchange the child on Fridays.');

    expect(result.chunkingVersion).toBe(DOCUMENT_CHUNKING_VERSION);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).toMatchObject({
      pageNumber: 1,
      isSynthetic: true,
      warnings: ['PAGE_BOUNDARIES_UNAVAILABLE'],
    });
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]).toMatchObject({
      chunkIndex: 0,
      sectionHeading: 'TEMPORARY ORDERS',
      warnings: ['PAGE_BOUNDARIES_UNAVAILABLE'],
    });
  });

  it('splits long text into overlapping chunks with stable character offsets', () => {
    const paragraphs = Array.from({ length: 90 }, (_, index) =>
      `Paragraph ${index + 1}. The respondent shall exchange documents no later than day ${index + 1}.`,
    );
    const result = buildDocumentMemoryArtifacts(paragraphs.join('\n\n'));

    expect(result.chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < result.chunks.length; i += 1) {
      expect(result.chunks[i].startChar).toBeLessThan(result.chunks[i - 1].endChar);
      expect(result.chunks[i].endChar).toBeGreaterThan(result.chunks[i].startChar);
      expect(result.chunks[i].tokenCount).toBeGreaterThan(0);
    }
  });

  it('returns empty artifacts for blank extracted text', () => {
    const result = buildDocumentMemoryArtifacts('   \n\n ');

    expect(result.pages).toHaveLength(0);
    expect(result.chunks).toHaveLength(0);
    expect(result.warnings).toContain('EMPTY_DOCUMENT_TEXT');
  });
});
