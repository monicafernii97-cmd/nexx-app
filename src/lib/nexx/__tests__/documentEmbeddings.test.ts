import { describe, expect, it } from 'vitest';
import type OpenAI from 'openai';
import { DOCUMENT_EMBEDDING_DIMENSIONS, embedDocumentMemoryArtifacts } from '../documentEmbeddings';
import type { DocumentMemoryArtifacts } from '../documentChunking';

const artifacts: DocumentMemoryArtifacts = {
  chunkingVersion: 'test', pages: [], blocks: [], tables: [], warnings: [],
  chunks: [{
    chunkIndex: 0, text: 'The parent shall pick up the child at 6 p.m.', textLength: 48,
    startChar: 0, endChar: 48, tokenCount: 12, blockIndexes: [], tableIndexes: [],
    retrievalMetadata: {
      containsTable: false, containsSignature: false, containsDate: false,
      containsDeadline: false, containsMoney: false, containsPartyName: false,
      containsOrderLanguage: true,
    }, warnings: [],
  }],
};

describe('canonical document embeddings', () => {
  it('attaches a versioned fixed-dimension vector without altering source text', async () => {
    const client = {
      embeddings: { create: async () => ({ data: [{ index: 0, embedding: Array(DOCUMENT_EMBEDDING_DIMENSIONS).fill(0.25) }] }) },
    } as unknown as OpenAI;
    const result = await embedDocumentMemoryArtifacts(artifacts, client);
    expect(result.chunks[0].text).toBe(artifacts.chunks[0].text);
    expect(result.chunks[0].embedding).toHaveLength(DOCUMENT_EMBEDDING_DIMENSIONS);
    expect(result.chunks[0].embeddingModel).toBe('text-embedding-3-small');
    expect(result.chunks[0].embeddingVersion).toBe('canonical-chunk-v1');
  });
});
