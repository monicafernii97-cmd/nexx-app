import { describe, expect, it } from 'vitest';
import { detectDocumentReference } from '../documentReferenceDetection';
import {
  retrieveRelevantDocumentChunks,
  type DocumentChunkRetrievalCandidate,
} from '../documentChunkRetrieval';
import { renderLegalInterpretationMarkdown } from '../legal-engine/legalInterpretationRenderer';
import type { LegalInterpretationAnswer } from '../legal-engine/legalInterpretationSchema';
import { verifyLegalInterpretationAnswer } from '../legal-engine/legalInterpretationVerifier';
import type { LegalDocumentSourcePacket } from '../legalDocumentAnswer';
import { classifyMessage, preserveOrUpgradeDocumentRoute } from '../router';

const internalLeakPattern =
  /\b(sourceId|chunkId|memoryGenerationId|blockIds|quotedText|documentAnswer|retrievalBuckets|retrievalReasons)\b/i;

function expectCleanUserAnswer(content: string) {
  expect(content).not.toMatch(internalLeakPattern);
  expect(content).not.toContain('# Court Order Analysis');
  expect(content).not.toContain('## Cautions');
  expect(content).not.toContain('Risks and Cautions');
  expect(content).not.toContain('Source Details');
  expect(content).not.toContain('OCR Warning');
  expect(content).not.toContain('Retrieval Details');
  expect(content).not.toContain('Verifier Status');
  expect(content).not.toContain('Confidence');
  expect(content).not.toContain('cannot safely support every part');
  expect(content).not.toContain('Signed Final Order.pdf, p.');
}

const fatherDaySources: LegalDocumentSourcePacket[] = [
  {
    sourceId: 'src_001',
    fileId: 'file_1',
    fileName: 'Signed Final Order.pdf',
    memoryGenerationId: 'gen_1',
    chunkId: 'chunk_1',
    blockIds: ['block_1'],
    pageStart: 5,
    pageEnd: 5,
    sectionHeading: 'Father\'s Day Possession',
    text: 'Father\'s Day possession begins at 6:00 p.m. on the Friday preceding Father\'s Day and ends at 8:00 a.m. on the Monday after Father\'s Day.',
    confidence: 0.72,
    warning: 'partial_ocr',
  },
  {
    sourceId: 'src_002',
    fileId: 'file_1',
    fileName: 'Signed Final Order.pdf',
    memoryGenerationId: 'gen_1',
    chunkId: 'chunk_2',
    blockIds: ['block_2'],
    pageStart: 6,
    pageEnd: 6,
    sectionHeading: 'Weekend Possession',
    text: 'Regular weekend possession begins on Thursday when Friday is a federal, state, or local holiday or a student holiday.',
    confidence: 0.91,
  },
  {
    sourceId: 'src_003',
    fileId: 'file_1',
    fileName: 'Signed Final Order.pdf',
    memoryGenerationId: 'gen_1',
    chunkId: 'chunk_3',
    blockIds: ['block_3'],
    pageStart: 4,
    pageEnd: 4,
    sectionHeading: 'Priority Language',
    text: 'Except as otherwise expressly provided in this order, the standard possession schedule applies.',
    confidence: 0.94,
  },
];

function fatherDayInterpretation(overrides: Partial<LegalInterpretationAnswer> = {}): LegalInterpretationAnswer {
  return {
    answerType: 'order_interpretation',
    directAnswer: 'No - Father\'s Day possession starts Friday at 6:00 p.m., not Thursday.',
    userFacingCertainty: 'clear',
    controllingClauses: [
      {
        label: 'Father\'s Day provision',
        quote: 'Father\'s Day possession begins at 6:00 p.m. on the Friday preceding Father\'s Day and ends at 8:00 a.m. on the Monday after Father\'s Day.',
        sourceIds: ['src_001'],
        pageStart: 5,
        pageEnd: 5,
      },
    ],
    competingClauses: [
      {
        label: 'Thursday-start weekend provision',
        quote: 'Regular weekend possession begins on Thursday when Friday is a federal, state, or local holiday or a student holiday.',
        sourceIds: ['src_002'],
        whyItDoesOrDoesNotControl: 'That language is the general weekend-extension rule; it does not override the specific Father\'s Day provision.',
      },
    ],
    priorityLanguage: [
      {
        signal: 'specific_over_general',
        explanation: 'The Father\'s Day clause is the specific rule for Father\'s Day possession, so it controls over the general weekend-extension language unless a later signed order changes it.',
        sourceIds: ['src_001', 'src_002', 'src_003'],
      },
    ],
    interpretation: {
      plainEnglish: 'Use the Father\'s Day provision for Father\'s Day possession.',
      legalReading: 'The specific Father\'s Day clause supplies the start and end times. The Thursday-start language applies to regular weekend possession when a qualifying Friday holiday occurs.',
      opposingArgument: 'The other parent may point to the Friday-holiday weekend rule.',
      responseToOpposingArgument: 'The Father\'s Day provision is more specific.',
    },
    practicalMeaning: {
      result: 'Follow Friday 6:00 p.m. to Monday 8:00 a.m. for Father\'s Day possession unless a later signed modification says otherwise.',
      startTime: 'Friday 6:00 p.m.',
      endTime: 'Monday 8:00 a.m.',
      whatUserShouldDo: 'Use the specific Father\'s Day language if you respond to the other parent.',
    },
    draftMessage: {
      tone: 'firm',
      text: 'Based on the order, Father\'s Day possession begins at 6:00 p.m. on the Friday preceding Father\'s Day and ends at 8:00 a.m. on the Monday after Father\'s Day. The Thursday-start language applies to regular weekend possession, not the specific Father\'s Day provision. I plan to follow the Father\'s Day provision as written.',
    },
    caveats: [],
    ...overrides,
  };
}

describe('NEXX legal agent golden behavior', () => {
  it('does not collapse attached possession questions into a generic document report route', () => {
    const message = 'Does Father\'s Day possession start Thursday because Juneteenth is Friday, or does the Father\'s Day clause control?';
    const classified = classifyMessage(message);
    const upgraded = preserveOrUpgradeDocumentRoute(classified, message);
    const detection = detectDocumentReference(message);

    expect(upgraded.mode).toBe('possession_access_schedule');
    expect(upgraded.legalIntent).toBe('possession_access_schedule');
    expect(upgraded.requiresDocumentRetrieval).toBe(true);
    expect(detection.referenceType).toBe('clause_conflict_interpretation');
    expect(detection.requiresPageOrSectionCitation).toBe(true);
  });

  it('retrieves clause hierarchy buckets before answering a holiday-possession conflict', () => {
    const chunks: DocumentChunkRetrievalCandidate[] = [
      {
        chunkId: 'intro',
        uploadedFileId: 'file-1',
        chunkIndex: 1,
        text: 'The parties appeared and announced ready.',
        textLength: 41,
        sectionHeading: 'Background',
        warnings: [],
      },
      {
        chunkId: 'father-day',
        uploadedFileId: 'file-1',
        chunkIndex: 12,
        text: 'Father\'s Day possession begins at 6:00 p.m. on the Friday preceding Father\'s Day and ends at 8:00 a.m. on the Monday after Father\'s Day.',
        textLength: 145,
        sectionHeading: 'Father\'s Day Possession',
        warnings: [],
      },
      {
        chunkId: 'weekend-extension',
        uploadedFileId: 'file-1',
        chunkIndex: 13,
        text: 'Regular weekend possession begins on Thursday when Friday is a federal, state, or local holiday or a student holiday.',
        textLength: 119,
        sectionHeading: 'Weekend Possession',
        warnings: [],
      },
      {
        chunkId: 'priority-language',
        uploadedFileId: 'file-1',
        chunkIndex: 14,
        text: 'Except as otherwise expressly provided in this order, the standard possession schedule applies.',
        textLength: 91,
        sectionHeading: 'Priority Language',
        warnings: [],
      },
      {
        chunkId: 'later-modification',
        uploadedFileId: 'file-1',
        chunkIndex: 15,
        text: 'This order supersedes any prior order except as modified by a later signed order.',
        textLength: 82,
        sectionHeading: 'Modified Orders',
        warnings: [],
      },
      {
        chunkId: 'definitions',
        uploadedFileId: 'file-1',
        chunkIndex: 16,
        text: 'A student holiday includes a school holiday or teacher in-service day listed by the child\'s school.',
        textLength: 97,
        sectionHeading: 'Definitions',
        warnings: [],
      },
    ];
    const message = 'Does Father\'s Day possession start Thursday because Juneteenth is Friday, or does the Father\'s Day clause control?';
    const result = retrieveRelevantDocumentChunks({
      message,
      detection: detectDocumentReference(message),
      chunks,
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
  });

  it('renders the Father\'s Day answer as direct legal interpretation, not a cautious report', () => {
    const content = renderLegalInterpretationMarkdown(
      fatherDayInterpretation(),
      fatherDaySources,
      'Fallback'
    );

    expect(content).toContain('No - Father\'s Day possession starts Friday at 6:00 p.m., not Thursday. [p. 5]');
    expect(content).toContain('**Controlling language:**');
    expect(content).toContain('**How the provisions work together:**');
    expect(content).not.toContain('**Competing language:**');
    expect(content).toContain('**Why this controls:**');
    expect(content).toContain('**Practical meaning:**');
    expect(content).not.toContain('**Suggested reply:**');
    expect(content).not.toContain('may control');
    expect(content).not.toContain('non-frivolous');
    expectCleanUserAnswer(content);
  });

  it('answers regular Friday-holiday weekend timing directly when no special clause conflict is present', () => {
    const answer: LegalInterpretationAnswer = fatherDayInterpretation({
      directAnswer: 'Yes - for a regular weekend possession period, the order starts the weekend on Thursday when Friday is a qualifying holiday.',
      controllingClauses: [
        {
          label: 'Regular weekend holiday extension',
          quote: 'Regular weekend possession begins on Thursday when Friday is a federal, state, or local holiday or a student holiday.',
          sourceIds: ['src_002'],
          pageStart: 6,
          pageEnd: 6,
        },
      ],
      competingClauses: [],
      priorityLanguage: [],
      interpretation: {
        plainEnglish: 'The Thursday-start rule applies to regular weekend possession.',
        legalReading: 'Because this question is about a regular weekend period rather than a separately listed holiday period, the Friday-holiday extension supplies the start time.',
      },
      practicalMeaning: {
        result: 'For regular weekend possession with a qualifying Friday holiday, use Thursday as the start day under the order.',
        startTime: 'Thursday',
        endTime: null,
        whatUserShouldDo: 'Confirm no separate holiday-specific clause changes that regular-weekend rule.',
      },
      draftMessage: null,
    });

    const verification = verifyLegalInterpretationAnswer(answer, fatherDaySources, {
      requiresLegalInterpretation: true,
      hasClauseConflictSignal: false,
    });
    const content = renderLegalInterpretationMarkdown(answer, fatherDaySources, 'Fallback');

    expect(verification.passed).toBe(true);
    expect(content).toContain('Yes - for a regular weekend possession period');
    expect(content).toContain('[p. 6]');
    expectCleanUserAnswer(content);
  });

  it('can say the visible order language lacks a requested clause without falling back to generic refusal text', () => {
    const answer: LegalInterpretationAnswer = fatherDayInterpretation({
      directAnswer: 'I do not see a Father\'s Day possession clause in the visible order language. The visible language only supports the regular weekend possession rule.',
      userFacingCertainty: 'insufficient_text',
      controllingClauses: [],
      competingClauses: [],
      priorityLanguage: [],
      interpretation: {
        plainEnglish: 'The visible order language does not contain a Father\'s Day-specific clause.',
        legalReading: 'Without a Father\'s Day-specific provision in the visible order language, I would not invent a separate holiday rule.',
      },
      practicalMeaning: {
        result: 'Use the visible regular-weekend rule unless the missing page or another signed order contains a Father\'s Day-specific provision.',
        startTime: null,
        endTime: null,
        whatUserShouldDo: 'Ask me to search a specific page or upload the missing page if you have it.',
      },
      draftMessage: null,
      caveats: ['The visible order language does not include a Father\'s Day-specific clause.'],
    });
    const verification = verifyLegalInterpretationAnswer(answer, fatherDaySources, {
      requiresLegalInterpretation: true,
      hasClauseConflictSignal: true,
    });
    const content = renderLegalInterpretationMarkdown(answer, fatherDaySources, 'Fallback');

    expect(verification.passed).toBe(true);
    expect(content).toContain('I do not see a Father\'s Day possession clause');
    expect(content).toContain('visible language only supports the regular weekend possession rule');
    expectCleanUserAnswer(content);
  });

  it('renders later signed modifications as controlling when that is the legal reading', () => {
    const sources: LegalDocumentSourcePacket[] = [
      ...fatherDaySources,
      {
        sourceId: 'src_004',
        fileId: 'file_1',
        fileName: 'Signed Final Order.pdf',
        memoryGenerationId: 'gen_1',
        chunkId: 'chunk_4',
        blockIds: ['block_4'],
        pageStart: 12,
        pageEnd: 12,
        sectionHeading: 'Modification',
        text: 'This later signed modification changes the exchange time to Sunday at 7:00 p.m. and controls over prior inconsistent possession provisions.',
        confidence: 0.96,
      },
    ];
    const answer = fatherDayInterpretation({
      directAnswer: 'Yes - the later signed modification controls over the earlier inconsistent possession language.',
      controllingClauses: [
        {
          label: 'Later modification',
          quote: 'This later signed modification changes the exchange time to Sunday at 7:00 p.m. and controls over prior inconsistent possession provisions.',
          sourceIds: ['src_004'],
          pageStart: 12,
          pageEnd: 12,
        },
      ],
      competingClauses: [
        {
          label: 'Earlier possession language',
          quote: 'Father\'s Day possession begins at 6:00 p.m. on the Friday preceding Father\'s Day and ends at 8:00 a.m. on the Monday after Father\'s Day.',
          sourceIds: ['src_001'],
          whyItDoesOrDoesNotControl: 'The earlier provision gives the baseline rule, but the later signed modification changes the inconsistent exchange time.',
        },
      ],
      priorityLanguage: [
        {
          signal: 'later_modification',
          explanation: 'Later signed modification language controls over earlier inconsistent language.',
          sourceIds: ['src_004'],
        },
      ],
      interpretation: {
        plainEnglish: 'Use the later signed modification where it conflicts with the earlier order.',
        legalReading: 'A later signed modification changes the inconsistent possession term, so the modified exchange time controls.',
      },
      practicalMeaning: {
        result: 'Use the modified Sunday 7:00 p.m. exchange time for the conflicting term.',
        startTime: null,
        endTime: 'Sunday 7:00 p.m.',
        whatUserShouldDo: 'Quote the modification if the other parent relies on the earlier order.',
      },
      draftMessage: null,
    });
    const content = renderLegalInterpretationMarkdown(answer, sources, 'Fallback');

    expect(content).toContain('Yes - the later signed modification controls');
    expect(content).toContain('[p. 12]');
    expect(content).toContain('Quote the modification');
    expectCleanUserAnswer(content);
  });

  it('surfaces genuine ambiguity plainly without default caution or source-detail sections', () => {
    const answer = fatherDayInterpretation({
      directAnswer: 'The cleaner reading is Friday at 6:00 p.m., but the exchange-location sentence creates a real ambiguity.',
      userFacingCertainty: 'ambiguous',
      caveats: [
        'The order uses two different exchange-location sentences for the same possession period.',
        'A filing should quote both sentences and ask the court to clarify which one controls.',
      ],
    });
    const content = renderLegalInterpretationMarkdown(answer, fatherDaySources, 'Fallback');

    expect(content).toContain('The cleaner reading is Friday at 6:00 p.m.');
    expect(content).toContain('Where it is genuinely unclear');
    expect(content).toContain('A filing should quote both sentences');
    expectCleanUserAnswer(content);
  });
});
