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
