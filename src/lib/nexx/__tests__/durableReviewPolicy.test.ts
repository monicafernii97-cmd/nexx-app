import { describe, expect, it } from 'vitest';
import {
  classifyDurableReviewFailure,
  durableReviewGenerationProfile,
  durableReviewNodeId,
  durableReviewRetryDecision,
} from '../durableReviewPolicy';

describe('durable exhaustive-review retry policy', () => {
  it.each([
    ['Unexpected end of JSON input', 'truncated_output'],
    ['JSON parse failed', 'malformed_json'],
    ['Understanding provider returned an invalid payload.', 'schema_validation'],
    ['provider timeout', 'provider_transient'],
    ['OPENAI_API_KEY is not configured.', 'provider_terminal'],
    ['Document coverage is not complete.', 'source_invariant'],
  ] as const)('classifies %s', (message, failureClass) => {
    expect(classifyDurableReviewFailure(new Error(message))).toBe(failureClass);
  });

  it('retries, tightens the schema, splits, and then dead-letters only a singleton', () => {
    expect(durableReviewRetryDecision({ attempt: 1, batchSize: 6, failureClass: 'malformed_json' })).toMatchObject({ kind: 'retry_same' });
    expect(durableReviewRetryDecision({ attempt: 2, batchSize: 6, failureClass: 'truncated_output' })).toMatchObject({ kind: 'retry_strict' });
    expect(durableReviewRetryDecision({ attempt: 3, batchSize: 6, failureClass: 'schema_validation' })).toEqual({ kind: 'split_batch', nextBatchSize: 3 });
    expect(durableReviewRetryDecision({ attempt: 3, batchSize: 1, failureClass: 'schema_validation' })).toEqual({ kind: 'dead_letter', reason: 'schema_validation' });
  });

  it('uses stable node identity for an unchanged input and changes it for a changed range', () => {
    const input = { stableJobId: 'review_file_generation', phase: 'map' as const, level: 0, sourceStart: 0, sourceEnd: 5, inputHash: 'abcdef1234567890abcdef' };
    expect(durableReviewNodeId(input)).toBe(durableReviewNodeId({ ...input }));
    expect(durableReviewNodeId(input)).not.toBe(durableReviewNodeId({ ...input, sourceEnd: 2 }));
  });

  it('preserves output budget while reducing reasoning on strict singleton retries', () => {
    expect(durableReviewGenerationProfile({ strictRetry: false, batchSize: 6 })).toEqual({
      reasoningEffort: 'medium',
      maxOutputTokens: 16_000,
    });
    expect(durableReviewGenerationProfile({ strictRetry: true, batchSize: 1 })).toEqual({
      reasoningEffort: 'low',
      maxOutputTokens: 20_000,
    });
  });
});
