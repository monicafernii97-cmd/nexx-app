export const DURABLE_REVIEW_NODE_MAX_ATTEMPTS = 3;

export type DurableReviewFailureClass =
  | 'malformed_json'
  | 'truncated_output'
  | 'schema_validation'
  | 'provider_transient'
  | 'provider_terminal'
  | 'source_invariant'
  | 'final_verification'
  | 'unknown';

export type DurableReviewRetryDecision =
  | { kind: 'retry_same'; nextAttempt: number; strict: false }
  | { kind: 'retry_strict'; nextAttempt: number; strict: true }
  | { kind: 'split_batch'; nextBatchSize: number }
  | { kind: 'dead_letter'; reason: DurableReviewFailureClass };

export function durableReviewGenerationProfile(args: { strictRetry: boolean; batchSize: number }) {
  if (args.strictRetry) {
    return {
      reasoningEffort: 'low' as const,
      maxOutputTokens: args.batchSize === 1 ? 20_000 : 16_000,
    };
  }
  return { reasoningEffort: 'medium' as const, maxOutputTokens: 16_000 };
}

export function classifyDurableReviewFailure(error: unknown): DurableReviewFailureClass {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  if (/unexpected end|unterminated|truncat|incomplete output|max(?:imum)? output tokens/.test(message)) {
    return 'truncated_output';
  }
  if (/json|parse|syntaxerror/.test(message)) return 'malformed_json';
  if (/schema|malformed findings|invalid payload|source id|quote is not present/.test(message)) {
    return 'schema_validation';
  }
  if (/coverage|canonical chunks?|non-active document generation|source invariant/.test(message)) {
    return 'source_invariant';
  }
  if (/verification|provenance does not cover/.test(message)) return 'final_verification';
  if (/timeout|timed out|rate limit|429|overload|temporarily unavailable|5\d\d/.test(message)) {
    return 'provider_transient';
  }
  if (/api[_ ]key|authentication|permission|content policy|unsupported/.test(message)) {
    return 'provider_terminal';
  }
  return 'unknown';
}

export function durableReviewRetryDecision(args: {
  attempt: number;
  batchSize: number;
  failureClass: DurableReviewFailureClass;
}): DurableReviewRetryDecision {
  if (args.failureClass === 'provider_terminal' || args.failureClass === 'source_invariant') {
    return { kind: 'dead_letter', reason: args.failureClass };
  }
  if (args.attempt <= 1) return { kind: 'retry_same', nextAttempt: 2, strict: false };
  if (args.attempt === 2) return { kind: 'retry_strict', nextAttempt: 3, strict: true };
  if (args.batchSize > 1) return { kind: 'split_batch', nextBatchSize: Math.max(1, Math.ceil(args.batchSize / 2)) };
  return { kind: 'dead_letter', reason: args.failureClass };
}

export function durableReviewNodeId(args: {
  stableJobId: string;
  phase: 'map' | 'reduce' | 'finalize';
  level: number;
  sourceStart: number;
  sourceEnd: number;
  inputHash: string;
}) {
  return [
    args.stableJobId,
    args.phase,
    `l${args.level}`,
    `${args.sourceStart}-${args.sourceEnd}`,
    args.inputHash.slice(0, 20),
  ].join(':');
}

export function strictStructuredOutputReminder() {
  return [
    'CORRECTION RETRY: Return exactly one JSON object matching the supplied strict schema.',
    'Do not add markdown fences, commentary, prefixes, suffixes, or incomplete fields.',
    'Keep each detail to one concise sentence. Copy an exact supporting quote of 8 to 30 words from one cited source chunk.',
    'Before returning, verify every quote is character-for-character present in its cited source after ordinary whitespace normalization.',
  ].join(' ');
}
