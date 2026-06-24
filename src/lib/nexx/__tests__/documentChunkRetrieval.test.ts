import { describe, expect, it } from 'vitest';
import { detectDocumentReference } from '../documentReferenceDetection';
import { retrieveRelevantDocumentChunks, type DocumentChunkRetrievalCandidate } from '../documentChunkRetrieval';

const chunks: DocumentChunkRetrievalCandidate[] = [
  {
    chunkId: 'chunk-1',
    uploadedFileId: 'file-1',
    chunkIndex: 0,
    text: 'This order contains introductory findings and appearances.',
    textLength: 58,
    pageStart: 1,
    pageEnd: 1,
    sectionHeading: 'Findings',
    warnings: [],
  },
  {
    chunkId: 'chunk-2',
    uploadedFileId: 'file-1',
    chunkIndex: 1,
    text: 'Respondent shall exchange the child at the police department parking lot no later than 6:00 p.m.',
    textLength: 95,
    pageStart: 3,
    pageEnd: 3,
    sectionHeading: 'Possession and Exchange',
    warnings: [],
  },
  {
    chunkId: 'chunk-3',
    uploadedFileId: 'file-1',
    chunkIndex: 2,
    text: 'Payment must be made within 10 calendar days after entry of this order.',
    textLength: 72,
    pageStart: 5,
    pageEnd: 5,
    sectionHeading: 'Fees and Deadlines',
    warnings: [],
  },
];

describe('retrieveRelevantDocumentChunks', () => {
  it('prioritizes exact terminology matches over early context', () => {
    const detection = detectDocumentReference('does it say shall or may?');
    const result = retrieveRelevantDocumentChunks({
      message: 'does it say shall or may?',
      detection,
      chunks,
      maxChunks: 2,
    });

    const exactChunk = result.find((chunk) => chunk.chunkId === 'chunk-2');
    expect(exactChunk).toBeTruthy();
    expect(exactChunk?.retrievalReasons).toContain('exact_term');
  });

  it('retrieves deadline language for deadline lookups', () => {
    const detection = detectDocumentReference('what deadlines are in it?');
    const result = retrieveRelevantDocumentChunks({
      message: 'what deadlines are in it?',
      detection,
      chunks,
      maxChunks: 2,
    });

    expect(result.map((chunk) => chunk.chunkId)).toContain('chunk-3');
    expect(result.find((chunk) => chunk.chunkId === 'chunk-3')?.retrievalReasons).toContain('deadline_pattern');
  });

  it('honors explicit page requests', () => {
    const detection = detectDocumentReference('what does page 3 say about exchanges?');
    const result = retrieveRelevantDocumentChunks({
      message: 'what does page 3 say about exchanges?',
      detection,
      chunks,
      maxChunks: 1,
    });

    expect(result[0]?.chunkId).toBe('chunk-2');
    expect(result[0]?.retrievalReasons).toContain('page_match');
  });
});
