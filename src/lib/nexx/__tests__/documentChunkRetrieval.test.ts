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
    const pageDisambiguationChunks: DocumentChunkRetrievalCandidate[] = [
      ...chunks,
      {
        chunkId: 'chunk-4',
        uploadedFileId: 'file-1',
        chunkIndex: 3,
        text: 'Exchange terms are summarized again in a later section.',
        textLength: 55,
        pageStart: 7,
        pageEnd: 7,
        sectionHeading: 'Possession and Exchange',
        warnings: [],
      },
    ];
    const detection = detectDocumentReference('what does page 3 say about exchanges?');
    const result = retrieveRelevantDocumentChunks({
      message: 'what does page 3 say about exchanges?',
      detection,
      chunks: pageDisambiguationChunks,
      maxChunks: 1,
    });

    expect(result[0]?.chunkId).toBe('chunk-2');
    expect(result[0]?.retrievalReasons).toContain('page_match');
  });

  it('prioritizes holiday possession clauses and includes neighboring context', () => {
    const holidayChunks: DocumentChunkRetrievalCandidate[] = [
      ...chunks,
      {
        chunkId: 'chunk-4',
        uploadedFileId: 'file-1',
        chunkIndex: 20,
        text: 'Other holiday provisions may not interfere with Father’s Day possession.',
        textLength: 71,
        sectionHeading: 'General Holiday Rules',
        warnings: [],
      },
      {
        chunkId: 'chunk-5',
        uploadedFileId: 'file-1',
        chunkIndex: 21,
        text: 'Father’s Day possession begins at 6:00 p.m. on the Friday before Father’s Day and ends at 6:00 p.m. on Father’s Day.',
        textLength: 123,
        sectionHeading: 'Father’s Day',
        warnings: [],
      },
      {
        chunkId: 'chunk-6',
        uploadedFileId: 'file-1',
        chunkIndex: 22,
        text: 'This holiday possession period controls over regular weekend possession.',
        textLength: 72,
        sectionHeading: 'Father’s Day continued',
        warnings: [],
      },
    ];
    const detection = detectDocumentReference('For Father’s Day possession, does his time start Thursday?');
    const result = retrieveRelevantDocumentChunks({
      message: 'For Father’s Day possession, does his time start Thursday?',
      detection,
      chunks: holidayChunks,
      maxChunks: 4,
    });

    expect(result.map((chunk) => chunk.chunkId)).toContain('chunk-5');
    expect(result.map((chunk) => chunk.chunkId)).toContain('chunk-6');
    expect(result.find((chunk) => chunk.chunkId === 'chunk-5')?.retrievalReasons).toContain('holiday_possession');
    expect(result.find((chunk) => chunk.chunkId === 'chunk-6')?.retrievalReasons).toContain('neighbor_context');
  });

  it('does not attach neighbor chunks from a different uploaded file', () => {
    const collisionChunks: DocumentChunkRetrievalCandidate[] = [
      {
        chunkId: 'file-1-anchor',
        uploadedFileId: 'file-1',
        chunkIndex: 7,
        text: 'Father’s Day possession begins at 6:00 p.m. on Friday.',
        textLength: 62,
        sectionHeading: 'Father’s Day',
        warnings: [],
      },
      {
        chunkId: 'file-2-neighbor',
        uploadedFileId: 'file-2',
        chunkIndex: 8,
        text: 'This unrelated document chunk should not be pulled as a neighbor.',
        textLength: 65,
        sectionHeading: 'Other Document',
        warnings: [],
      },
    ];
    const detection = detectDocumentReference('For Father’s Day possession, does his time start Thursday?');
    const result = retrieveRelevantDocumentChunks({
      message: 'For Father’s Day possession, does his time start Thursday?',
      detection,
      chunks: collisionChunks,
      maxChunks: 3,
    });

    expect(result.map((chunk) => chunk.chunkId)).toContain('file-1-anchor');
    expect(result.map((chunk) => chunk.chunkId)).not.toContain('file-2-neighbor');
  });

  it('boosts Saturday holiday-possession clauses', () => {
    const saturdayChunks: DocumentChunkRetrievalCandidate[] = [
      {
        chunkId: 'generic-holiday',
        uploadedFileId: 'file-1',
        chunkIndex: 1,
        text: 'The parties must comply with the holiday schedule in this order.',
        textLength: 66,
        sectionHeading: 'Holiday Schedule',
        warnings: [],
      },
      {
        chunkId: 'saturday-possession',
        uploadedFileId: 'file-1',
        chunkIndex: 2,
        text: 'Holiday possession that begins on Saturday starts at 10:00 a.m. unless this order says otherwise.',
        textLength: 99,
        sectionHeading: 'Holiday Possession',
        warnings: [],
      },
    ];
    const detection = detectDocumentReference('What does the holiday possession schedule say about Saturday pickup?');
    const result = retrieveRelevantDocumentChunks({
      message: 'What does the holiday possession schedule say about Saturday pickup?',
      detection,
      chunks: saturdayChunks,
      maxChunks: 1,
    });

    expect(result[0]?.chunkId).toBe('saturday-possession');
    expect(result[0]?.retrievalReasons).toContain('holiday_possession');
  });
});
