import { describe, expect, it } from 'vitest';
import { appendResponseContinuation, isOutputTokenIncompleteReason } from '../responseContinuation';

describe('response continuation', () => {
  it('removes repeated boundary text from a resumed answer', () => {
    const overlap = 'The next requirement is payment by Friday.';
    expect(appendResponseContinuation(`First section.\n\n${overlap}`, `${overlap}\n\nSecond section.`))
      .toBe(`First section.\n\n${overlap}\n\nSecond section.`);
  });

  it('separates independent continuation blocks cleanly', () => {
    expect(appendResponseContinuation('First section.', 'Second section.')).toBe('First section.\n\nSecond section.');
  });

  it('continues only token-limit incomplete responses', () => {
    expect(isOutputTokenIncompleteReason('max_output_tokens')).toBe(true);
    expect(isOutputTokenIncompleteReason('content_filter')).toBe(false);
  });
});
