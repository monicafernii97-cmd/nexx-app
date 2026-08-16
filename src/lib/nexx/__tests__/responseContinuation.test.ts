import { describe, expect, it } from 'vitest';
import { appendResponseContinuation, isOutputTokenIncompleteReason, resumeTokenLimitedResponse, type ResponseContinuationEvent } from '../responseContinuation';

async function* events(values: ResponseContinuationEvent[]) {
  for (const value of values) yield value;
}

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

  it('automatically resumes multiple interrupted segments and checkpoints the assembled answer', async () => {
    const checkpoints: string[] = [];
    const streams = [
      events([
        { type: 'response.output_text.delta', delta: 'Middle section.' },
        { type: 'response.incomplete', response: { id: 'response_2', incomplete_details: { reason: 'max_output_tokens' } } },
      ]),
      events([
        { type: 'response.output_text.delta', delta: 'Ending section.' },
        { type: 'response.completed', response: { id: 'response_3' } },
      ]),
    ];
    const previousIds: string[] = [];
    const result = await resumeTokenLimitedResponse({
      existingText: 'Beginning section.',
      responseId: 'response_1',
      incompleteReason: 'max_output_tokens',
      createStream: async (previousId) => {
        previousIds.push(previousId);
        return streams.shift()!;
      },
      onCheckpoint: ({ text }) => { checkpoints.push(text); },
    });

    expect(previousIds).toEqual(['response_1', 'response_2']);
    expect(result).toMatchObject({ completed: true, responseId: 'response_3', continuationCount: 2 });
    expect(result.text).toBe('Beginning section.\n\nMiddle section.\n\nEnding section.');
    expect(checkpoints).toHaveLength(2);
    expect(checkpoints[1]).toBe(result.text);
  });
});
