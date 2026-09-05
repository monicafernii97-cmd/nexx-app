export type ProviderStreamStrategy = 'full' | 'continue' | 'compact' | 'deterministic_scoped';

export type ProviderStreamFailureCode =
  | 'provider_stream_interrupted'
  | 'provider_stream_timeout'
  | 'provider_stream_inactive'
  | 'provider_output_incomplete'
  | 'provider_stream_failed';

export type ProviderStreamTerminal =
  | { kind: 'completed'; responseId: string; text: string }
  | { kind: 'incomplete'; responseId?: string; reason: string; text: string }
  | {
      kind: 'interrupted';
      responseId?: string;
      lastEventType?: string;
      text: string;
      elapsedMs: number;
    }
  | { kind: 'timed_out'; responseId?: string; text: string; elapsedMs: number }
  | {
      kind: 'failed';
      responseId?: string;
      providerCode?: string;
      messageSafe: string;
    };

export type ProviderStreamSnapshot = {
  responseId?: string;
  text: string;
  elapsedMs: number;
  lastEventType?: string;
  terminalEvent?: 'completed' | 'incomplete' | 'failed';
  incompleteReason?: string;
  providerCode?: string;
  providerMessageSafe?: string;
  deadlineExceeded?: boolean;
};

export const PROVIDER_GENERATION_BUDGET_MS = 95_000;
export const PROVIDER_FIRST_ATTEMPT_TIMEOUT_MS = 35_000;
export const PROVIDER_RECOVERY_ATTEMPT_TIMEOUT_MS = 25_000;
export const PROVIDER_MINIMUM_ATTEMPT_BUDGET_MS = 8_000;
export const PROVIDER_MAX_GENERATION_ATTEMPTS = 3;

export function providerAttemptTimeoutMs(args: {
  attemptNumber: number;
  remainingBudgetMs: number;
}) {
  const ceiling = args.attemptNumber === 1
    ? PROVIDER_FIRST_ATTEMPT_TIMEOUT_MS
    : PROVIDER_RECOVERY_ATTEMPT_TIMEOUT_MS;
  return Math.max(0, Math.min(ceiling, Math.floor(args.remainingBudgetMs)));
}

export function decideProviderStreamRetry(args: {
  attemptNumber: number;
  retryable: boolean;
  responseId?: string;
  remainingBudgetMs: number;
}): ProviderStreamStrategy | 'stop' {
  if (
    !args.retryable ||
    args.attemptNumber >= PROVIDER_MAX_GENERATION_ATTEMPTS ||
    args.remainingBudgetMs < PROVIDER_MINIMUM_ATTEMPT_BUDGET_MS
  ) return 'stop';
  return args.responseId ? 'continue' : 'compact';
}

/**
 * Convert stream state into one exhaustive terminal result. An iterator that
 * stops without a provider terminal event is explicitly interrupted; callers
 * must never reinterpret it as an unknown, non-retryable exception.
 */
export function classifyProviderStreamTerminal(snapshot: ProviderStreamSnapshot): ProviderStreamTerminal {
  if (snapshot.terminalEvent === 'completed' && snapshot.responseId) {
    return { kind: 'completed', responseId: snapshot.responseId, text: snapshot.text };
  }
  if (snapshot.terminalEvent === 'incomplete') {
    return {
      kind: 'incomplete',
      responseId: snapshot.responseId,
      reason: snapshot.incompleteReason || 'unknown',
      text: snapshot.text,
    };
  }
  if (snapshot.terminalEvent === 'failed') {
    return {
      kind: 'failed',
      responseId: snapshot.responseId,
      providerCode: snapshot.providerCode,
      messageSafe: snapshot.providerMessageSafe || 'The provider stream failed.',
    };
  }
  if (snapshot.deadlineExceeded) {
    return {
      kind: 'timed_out',
      responseId: snapshot.responseId,
      text: snapshot.text,
      elapsedMs: snapshot.elapsedMs,
    };
  }
  return {
    kind: 'interrupted',
    responseId: snapshot.responseId,
    lastEventType: snapshot.lastEventType,
    text: snapshot.text,
    elapsedMs: snapshot.elapsedMs,
  };
}

export class ProviderStreamLifecycleError extends Error {
  readonly code: ProviderStreamFailureCode;
  readonly retryable: boolean;
  readonly responseId?: string;
  readonly providerCode?: string;
  readonly lastEventType?: string;
  readonly elapsedMs?: number;
  readonly incompleteReason?: string;

  constructor(args: {
    code: ProviderStreamFailureCode;
    message: string;
    retryable?: boolean;
    responseId?: string;
    providerCode?: string;
    lastEventType?: string;
    elapsedMs?: number;
    incompleteReason?: string;
  }) {
    super(args.message);
    this.name = 'ProviderStreamLifecycleError';
    this.code = args.code;
    this.retryable = args.retryable ?? args.code !== 'provider_stream_failed';
    this.responseId = args.responseId;
    this.providerCode = args.providerCode;
    this.lastEventType = args.lastEventType;
    this.elapsedMs = args.elapsedMs;
    this.incompleteReason = args.incompleteReason;
  }
}

export function streamTerminalError(terminal: ProviderStreamTerminal) {
  if (terminal.kind === 'completed') {
    throw new Error('A completed provider stream cannot be converted to a failure.');
  }
  if (terminal.kind === 'interrupted') {
    return new ProviderStreamLifecycleError({
      code: 'provider_stream_interrupted',
      message: 'Provider stream ended before a terminal event.',
      responseId: terminal.responseId,
      lastEventType: terminal.lastEventType,
      elapsedMs: terminal.elapsedMs,
    });
  }
  if (terminal.kind === 'timed_out') {
    return new ProviderStreamLifecycleError({
      code: 'provider_stream_timeout',
      message: 'Provider stream exceeded its absolute deadline.',
      responseId: terminal.responseId,
      elapsedMs: terminal.elapsedMs,
    });
  }
  if (terminal.kind === 'incomplete') {
    return new ProviderStreamLifecycleError({
      code: 'provider_output_incomplete',
      message: `Provider response was incomplete: ${terminal.reason}`,
      responseId: terminal.responseId,
      incompleteReason: terminal.reason,
    });
  }
  return new ProviderStreamLifecycleError({
    code: 'provider_stream_failed',
    message: terminal.messageSafe,
    retryable: /rate|timeout|server|overload|unavailable|temporar/i.test(terminal.providerCode ?? terminal.messageSafe),
    responseId: terminal.responseId,
    providerCode: terminal.providerCode,
  });
}
