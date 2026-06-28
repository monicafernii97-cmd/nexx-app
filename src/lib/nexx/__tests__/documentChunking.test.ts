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
    expect(result.blocks.length).toBeGreaterThan(0);
    expect(result.blocks[0]).toMatchObject({
      blockIndex: 0,
      pageNumber: 1,
      type: 'title',
      sectionHeading: 'TEMPORARY ORDERS',
    });
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]).toMatchObject({
      chunkIndex: 0,
      sectionHeading: 'TEMPORARY ORDERS',
      pageStart: 1,
      pageEnd: 1,
      warnings: ['PAGE_BOUNDARIES_UNAVAILABLE'],
    });
    expect(result.chunks[0].blockIndexes.length).toBeGreaterThan(0);
    expect(result.chunks[0].retrievalMetadata).toMatchObject({
      containsDeadline: false,
      containsOrderLanguage: true,
    });
  });

  it('splits long text into overlapping chunks with stable character offsets', () => {
    const paragraphs = Array.from({ length: 90 }, (_, index) =>
      `Paragraph ${index + 1}. The respondent shall exchange documents no later than day ${index + 1}.`,
    );
    const result = buildDocumentMemoryArtifacts(paragraphs.join('\n\n'));

    expect(result.chunks.length).toBeGreaterThan(1);
    expect(result.chunks[0].blockIndexes.length).toBeGreaterThan(0);
    for (let i = 1; i < result.chunks.length; i += 1) {
      expect(result.chunks[i].startChar).toBeLessThan(result.chunks[i - 1].endChar);
      expect(result.chunks[i].endChar).toBeGreaterThan(result.chunks[i].startChar);
      expect(result.chunks[i].tokenCount).toBeGreaterThan(0);
      expect(result.chunks[i].blockIndexes.length).toBeGreaterThan(0);
    }
  });

  it('preserves table-shaped content as table artifacts linked to chunks', () => {
    const result = buildDocumentMemoryArtifacts([
      'VISITATION SCHEDULE',
      '',
      '| Day | Time | Location |',
      '| Monday | 8:00 AM | School |',
      '| Friday | 6:00 PM | Police Department |',
    ].join('\n'));

    expect(result.tables).toHaveLength(1);
    expect(result.blocks.some((block) => block.type === 'table' && block.tableIndex === 0)).toBe(true);
    expect(result.chunks[0].tableIndexes).toContain(0);
    expect(result.chunks[0].retrievalMetadata.containsTable).toBe(true);
  });

  it('flags deadline, money, party, and signature language for retrieval', () => {
    const result = buildDocumentMemoryArtifacts([
      'FINAL ORDER',
      '',
      '1. Respondent shall pay $500 no later than June 14, 2026.',
      '',
      '______________________________',
      'Judge Presiding',
    ].join('\n'));

    expect(result.blocks.some((block) => block.type === 'signature')).toBe(true);
    expect(result.chunks[0].retrievalMetadata).toMatchObject({
      containsDate: true,
      containsDeadline: true,
      containsMoney: true,
      containsPartyName: true,
      containsOrderLanguage: true,
      containsSignature: true,
    });
  });

  it('returns empty artifacts for blank extracted text', () => {
    const result = buildDocumentMemoryArtifacts('   \n\n ');

    expect(result.pages).toHaveLength(0);
    expect(result.blocks).toHaveLength(0);
    expect(result.tables).toHaveLength(0);
    expect(result.chunks).toHaveLength(0);
    expect(result.warnings).toContain('EMPTY_DOCUMENT_TEXT');
  });
});
