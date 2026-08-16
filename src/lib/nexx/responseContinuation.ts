/** Join provider continuation text while removing a repeated boundary prefix. */
export function appendResponseContinuation(existing: string, continuation: string) {
  if (!existing) return continuation;
  if (!continuation) return existing;
  const maxOverlap = Math.min(800, existing.length, continuation.length);
  for (let overlap = maxOverlap; overlap >= 20; overlap -= 1) {
    if (existing.slice(-overlap) === continuation.slice(0, overlap)) {
      return existing + continuation.slice(overlap);
    }
  }
  const separator = /\s$/.test(existing) || /^\s/.test(continuation) ? '' : '\n\n';
  return existing + separator + continuation;
}

export function isOutputTokenIncompleteReason(reason?: string) {
  return reason === 'max_output_tokens' || reason === 'max_tokens';
}

export type ResponseContinuationEvent =
  | { type: 'response.output_text.delta'; delta?: string }
  | { type: 'response.completed'; response?: { id?: string } }
  | { type: 'response.incomplete'; response?: { id?: string; incomplete_details?: { reason?: string } } }
  | { type: 'response.failed' | 'error' };

/** Resume a token-limited provider response and checkpoint each assembled draft. */
export async function resumeTokenLimitedResponse(args: {
  existingText: string;
  responseId: string;
  incompleteReason?: string;
  maxContinuations?: number;
  createStream: (previousResponseId: string) => Promise<AsyncIterable<ResponseContinuationEvent>>;
  onCheckpoint?: (checkpoint: {
    text: string;
    responseId: string;
    continuationCount: number;
    completed: boolean;
    incompleteReason?: string;
  }) => Promise<void> | void;
}) {
  let text = args.existingText;
  let responseId = args.responseId;
  let incompleteReason = args.incompleteReason;
  for (let continuationCount = 1; continuationCount <= (args.maxContinuations ?? 2); continuationCount += 1) {
    if (!isOutputTokenIncompleteReason(incompleteReason)) break;
    const stream = await args.createStream(responseId);
    let continuation = '';
    let completed = false;
    incompleteReason = undefined;
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') continuation += event.delta ?? '';
      else if (event.type === 'response.completed') {
        responseId = event.response?.id ?? responseId;
        completed = true;
      } else if (event.type === 'response.incomplete') {
        responseId = event.response?.id ?? responseId;
        incompleteReason = event.response?.incomplete_details?.reason;
      } else if (event.type === 'response.failed' || event.type === 'error') {
        throw new Error('Provider continuation failed.');
      }
    }
    text = appendResponseContinuation(text, continuation);
    await args.onCheckpoint?.({ text, responseId, continuationCount, completed, incompleteReason });
    if (completed) return { text, responseId, completed: true as const, continuationCount };
  }
  return { text, responseId, completed: false as const, incompleteReason };
}
