import { describe, expect, it } from 'vitest';
import {
  finalizeAgenticOutcome,
  findReassessmentTarget,
  isReassessmentRequest,
  normalizeProviderFailure,
} from '../agenticOutcome';

describe('agentic outcome and recovery policy', () => {
  it.each([
    'Why did you analyze the order when I only said hey?',
    'Please audit your last response.',
    'Why is the exhaustive review marked failed?',
  ])('recognizes diagnostic requests: %s', (message) => {
    expect(isReassessmentRequest(message)).toBe(true);
  });

  it('detects natural challenge language and targets the latest active answer', () => {
    expect(isReassessmentRequest('That is not what the order says. Look again.')).toBe(true);
    expect(findReassessmentTarget('Are you sure?', [
      { id: 'a1', role: 'assistant', content: 'Old answer', status: 'committed', superseded: true },
      { id: 'u2', role: 'user', content: 'Follow-up', status: 'committed' },
      { id: 'a2', role: 'assistant', content: 'Current answer', status: 'committed' },
    ])).toEqual({ messageId: 'a2', content: 'Current answer' });
  });

  it('does not classify unknown, auth, or invalid-request failures as retryable', () => {
    expect(normalizeProviderFailure(new Error('mystery failure')).retryable).toBe(false);
    expect(normalizeProviderFailure({ status: 401, message: 'Authentication failed' }).retryable).toBe(false);
    expect(normalizeProviderFailure({ status: 400, message: 'Invalid request' }).retryable).toBe(false);
  });

  it('classifies bounded transient conditions as retryable', () => {
    expect(normalizeProviderFailure({ status: 429, message: 'Rate limit' }).retryable).toBe(true);
    expect(normalizeProviderFailure({ status: 503, message: 'Unavailable' }).retryable).toBe(true);
  });

  it('locks correction metadata to the actual challenged message', () => {
    const outcome = finalizeAgenticOutcome({
      status: 'corrected', completed: ['Rechecked'], missing: [], blockedReason: null, retryable: false,
      nextBestAction: null,
      correction: { targetMessageId: 'invented', finding: 'wrong', summary: 'Corrected it', invalidatedFactIds: [], invalidatedArtifactIds: [] },
    }, { messageId: 'actual', content: 'Prior answer' });
    expect(outcome.correction?.targetMessageId).toBe('actual');
    expect(outcome.status).toBe('corrected');
  });
});
