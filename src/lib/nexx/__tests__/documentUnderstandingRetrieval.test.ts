import { describe, expect, it } from 'vitest';
import { parseUnderstandingForRetrieval, selectUnderstandingSourceIndexes } from '../documentUnderstandingRetrieval';

const payload = {
  overview: 'A complete parenting order.',
  findings: [
    { category: 'Support', title: 'Monthly support', detail: 'Payment is due monthly.', quote: 'pay support', sourceIds: ['SOURCE_CHUNK_2'] },
    { category: 'Possession', title: 'Holiday pickup', detail: 'The pickup time applies on Father\'s Day.', quote: 'pickup at 6 p.m.', sourceIds: ['SOURCE_CHUNK_9', 'SOURCE_CHUNK_10'] },
    { category: 'Communication', title: 'Parent communication', detail: 'Parents must use the application.', quote: 'use the application', sourceIds: ['SOURCE_CHUNK_14'] },
  ],
  uncertainties: [],
};

describe('document understanding guided retrieval', () => {
  it('maps a semantic follow-up to the verified canonical source chunks', () => {
    expect(selectUnderstandingSourceIndexes({ payload, message: 'What time is holiday pickup?' })).toEqual([9, 10]);
  });

  it('returns bounded broad anchors for a general follow-up', () => {
    expect(selectUnderstandingSourceIndexes({ payload, message: 'What else matters?', maxFindings: 2 })).toEqual([2, 9, 10]);
  });

  it('ignores malformed stored JSON', () => {
    expect(parseUnderstandingForRetrieval('{"findings":false}')).toBeNull();
    expect(parseUnderstandingForRetrieval(JSON.stringify(payload))).toEqual(payload);
  });
});
