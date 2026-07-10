import { describe, expect, it } from 'vitest';
import { detectDocumentReference } from '../documentReferenceDetection';
import {
  buildDocumentChunkSearchQuery,
  retrieveRelevantDocumentChunks,
  type DocumentChunkRetrievalCandidate,
} from '../documentChunkRetrieval';

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
  it('builds a compact full-text query from exact terms and sections', () => {
    const detection = detectDocumentReference('Does section 7 say shall or may about Father day possession?');
    const query = buildDocumentChunkSearchQuery(
      'Does section 7 say shall or may about Father day possession?',
      detection
    );

    expect(query).toContain('shall');
    expect(query).toContain('may');
    expect(query).toContain('7');
    expect(query.length).toBeLessThanOrEqual(400);
  });

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

  it('covers filing-specific buckets across a long filing', () => {
    const filingChunks: DocumentChunkRetrievalCandidate[] = Array.from({ length: 30 }, (_, index) => ({
      chunkId: `filing-${index + 1}`,
      uploadedFileId: 'file-filing',
      chunkIndex: index,
      text: `Filler page ${index + 1}. General background text without the key filing sections.`,
      textLength: 72,
      pageStart: index + 1,
      pageEnd: index + 1,
      sectionHeading: `Page ${index + 1}`,
      warnings: [],
    }));
    filingChunks[0] = {
      ...filingChunks[0],
      text: 'Cause No. 123. In the Interest of A Child. Motion to Enforce Possession filed by Petitioner against Respondent.',
      sectionHeading: 'Caption and Motion Title',
    };
    filingChunks[5] = {
      ...filingChunks[5],
      text: 'Factual allegations and grounds. Petitioner alleges Respondent failed to surrender the child and violated the possession order.',
      sectionHeading: 'Allegations and Grounds',
    };
    filingChunks[23] = {
      ...filingChunks[23],
      text: 'Prayer. Petitioner requests that the Court hold Respondent in contempt, order makeup possession, and award attorney fees.',
      sectionHeading: 'Prayer for Relief',
    };
    filingChunks[26] = {
      ...filingChunks[26],
      text: 'Notice of hearing. The hearing is set for July 15, 2026 at 9:00 a.m. A written response deadline may apply.',
      sectionHeading: 'Notice of Hearing',
    };
    filingChunks[28] = {
      ...filingChunks[28],
      text: 'Certificate of service. This filing was served by email on July 1, 2026.',
      sectionHeading: 'Certificate of Service',
    };

    const detection = detectDocumentReference('What do I file next after being served with this motion?');
    const result = retrieveRelevantDocumentChunks({
      message: 'What do I file next after being served with this motion?',
      detection,
      chunks: filingChunks,
      maxChunks: 12,
    });

    expect(result.find((chunk) => chunk.chunkId === 'filing-1')?.filingRetrievalBuckets).toContain('caption_and_document_type');
    expect(result.find((chunk) => chunk.chunkId === 'filing-6')?.filingRetrievalBuckets).toContain('allegations_and_grounds');
    expect(result.find((chunk) => chunk.chunkId === 'filing-24')?.filingRetrievalBuckets).toContain('relief_and_prayer');
    expect(result.find((chunk) => chunk.chunkId === 'filing-27')?.filingRetrievalBuckets).toContain('hearing_and_deadline');
    expect(result.find((chunk) => chunk.chunkId === 'filing-29')?.filingRetrievalBuckets).toContain('service_and_certificate');
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
    expect(result.find((chunk) => chunk.chunkId === 'chunk-6')?.retrievalReasons.some((reason) =>
      reason === 'neighbor_context' || reason === 'clause_bucket'
    )).toBe(true);
  });

  it('covers clause buckets for holiday possession interpretation', () => {
    const clauseChunks: DocumentChunkRetrievalCandidate[] = [
      {
        chunkId: 'background',
        uploadedFileId: 'file-1',
        chunkIndex: 0,
        text: 'The order includes background findings about the parties.',
        textLength: 58,
        sectionHeading: 'Findings',
        warnings: [],
      },
      {
        chunkId: 'father-day',
        uploadedFileId: 'file-1',
        chunkIndex: 7,
        text: 'Father\'s Day possession begins at 6:00 p.m. on the Friday preceding Father\'s Day and ends at 8:00 a.m. on the Monday after Father\'s Day.',
        textLength: 145,
        sectionHeading: 'Father\'s Day Possession',
        warnings: [],
      },
      {
        chunkId: 'weekend-extension',
        uploadedFileId: 'file-1',
        chunkIndex: 8,
        text: 'Regular weekend possession begins on Thursday when Friday is a federal, state, or local holiday or a student holiday.',
        textLength: 119,
        sectionHeading: 'Weekend Possession',
        warnings: [],
      },
      {
        chunkId: 'priority-language',
        uploadedFileId: 'file-1',
        chunkIndex: 9,
        text: 'Except as otherwise expressly provided in this order, the standard possession schedule applies.',
        textLength: 91,
        sectionHeading: 'Priority Language',
        warnings: [],
      },
      {
        chunkId: 'later-modification',
        uploadedFileId: 'file-1',
        chunkIndex: 10,
        text: 'This order supersedes any prior order except as modified by a later signed order.',
        textLength: 82,
        sectionHeading: 'Modified Orders',
        warnings: [],
      },
      {
        chunkId: 'definitions',
        uploadedFileId: 'file-1',
        chunkIndex: 11,
        text: 'A student holiday includes a school holiday or teacher in-service day listed by the child\'s school.',
        textLength: 97,
        sectionHeading: 'Definitions',
        warnings: [],
      },
    ];
    const detection = detectDocumentReference('Which clause controls if Father\'s Day possession conflicts with the regular Thursday-start weekend clause?');
    const result = retrieveRelevantDocumentChunks({
      message: 'Which clause controls if Father\'s Day possession conflicts with the regular Thursday-start weekend clause?',
      detection,
      chunks: clauseChunks,
      maxChunks: 5,
    });

    expect(result.map((chunk) => chunk.chunkId)).toEqual([
      'father-day',
      'weekend-extension',
      'priority-language',
      'later-modification',
      'definitions',
    ]);
    expect(result.find((chunk) => chunk.chunkId === 'father-day')?.retrievalBuckets).toContain('controlling_specific_clause');
    expect(result.find((chunk) => chunk.chunkId === 'weekend-extension')?.retrievalBuckets).toContain('competing_general_clause');
    expect(result.find((chunk) => chunk.chunkId === 'priority-language')?.retrievalBuckets).toContain('exception_priority_language');
    expect(result.find((chunk) => chunk.chunkId === 'later-modification')?.retrievalBuckets).toContain('later_modification_language');
    expect(result.find((chunk) => chunk.chunkId === 'definitions')?.retrievalBuckets).toContain('definition_language');
    expect(result.every((chunk) => chunk.retrievalReasons.includes('clause_bucket'))).toBe(true);
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

  it('uses retrieval metadata to surface table-heavy payment chunks', () => {
    const tableChunks: DocumentChunkRetrievalCandidate[] = [
      {
        chunkId: 'narrative',
        uploadedFileId: 'file-1',
        chunkIndex: 0,
        text: 'The order includes general background about the parties.',
        textLength: 58,
        sectionHeading: 'Background',
        warnings: [],
      },
      {
        chunkId: 'payment-table',
        uploadedFileId: 'file-1',
        chunkIndex: 12,
        text: 'Monthly support schedule: January $500, February $500, March $500.',
        textLength: 70,
        sectionHeading: 'Support Schedule',
        retrievalMetadata: {
          containsTable: true,
          containsMoney: true,
        },
        warnings: [],
      },
    ];
    const detection = detectDocumentReference('What does the payment table say?');
    const result = retrieveRelevantDocumentChunks({
      message: 'What does the payment table say?',
      detection,
      chunks: tableChunks,
      maxChunks: 1,
    });

    expect(result[0]?.chunkId).toBe('payment-table');
    expect(result[0]?.retrievalReasons).toContain('metadata_match');
  });

  it('does not reserve neighbor slots when no selected chunk can anchor expansion', () => {
    const keywordOnlyChunks: DocumentChunkRetrievalCandidate[] = [
      {
        chunkId: 'payment-overview',
        uploadedFileId: 'file-1',
        chunkIndex: 12,
        text: 'The payment schedule is described in ordinary text without table metadata.',
        textLength: 73,
        sectionHeading: 'Support',
        warnings: [],
      },
      {
        chunkId: 'payment-followup',
        uploadedFileId: 'file-1',
        chunkIndex: 19,
        text: 'Additional payment timing details appear in this later paragraph.',
        textLength: 66,
        sectionHeading: 'Support',
        warnings: [],
      },
    ];
    const detection = detectDocumentReference('What does the payment table say?');
    const result = retrieveRelevantDocumentChunks({
      message: 'What does the payment table say?',
      detection,
      chunks: keywordOnlyChunks,
      maxChunks: 2,
    });

    expect(result.map((chunk) => chunk.chunkId)).toEqual(['payment-overview', 'payment-followup']);
  });

  it('expands neighbor context around metadata-ranked chunks', () => {
    const tableChunks: DocumentChunkRetrievalCandidate[] = [
      {
        chunkId: 'payment-table',
        uploadedFileId: 'file-1',
        chunkIndex: 12,
        text: 'Monthly support schedule: January $500, February $500, March $500.',
        textLength: 70,
        sectionHeading: 'Support Schedule',
        retrievalMetadata: {
          containsTable: true,
          containsMoney: true,
        },
        warnings: [],
      },
      {
        chunkId: 'payment-table-note',
        uploadedFileId: 'file-1',
        chunkIndex: 13,
        text: 'Payments are due on the first day of each month unless the order states otherwise.',
        textLength: 83,
        sectionHeading: 'Support Schedule Continued',
        warnings: [],
      },
    ];
    const detection = detectDocumentReference('What does the payment table say?');
    const result = retrieveRelevantDocumentChunks({
      message: 'What does the payment table say?',
      detection,
      chunks: tableChunks,
      maxChunks: 2,
    });

    expect(result.map((chunk) => chunk.chunkId)).toEqual(['payment-table', 'payment-table-note']);
    expect(result.find((chunk) => chunk.chunkId === 'payment-table-note')?.retrievalReasons).toContain('neighbor_context');
  });

  it('uses order-language metadata for broad order questions', () => {
    const orderLanguageChunks: DocumentChunkRetrievalCandidate[] = [
      {
        chunkId: 'background',
        uploadedFileId: 'file-1',
        chunkIndex: 0,
        text: 'The parties appeared and announced ready.',
        textLength: 41,
        sectionHeading: 'Appearances',
        warnings: [],
      },
      {
        chunkId: 'ordered-relief',
        uploadedFileId: 'file-1',
        chunkIndex: 9,
        text: 'It is ordered that Respondent shall surrender the passports by Friday.',
        textLength: 72,
        sectionHeading: 'Orders',
        retrievalMetadata: {
          containsOrderLanguage: true,
        },
        warnings: [],
      },
    ];
    const detection = detectDocumentReference('What does the order say?');
    const result = retrieveRelevantDocumentChunks({
      message: 'What does the order say?',
      detection,
      chunks: orderLanguageChunks,
      maxChunks: 1,
    });

    expect(result[0]?.chunkId).toBe('ordered-relief');
    expect(result[0]?.retrievalReasons).toContain('metadata_match');
  });
});
