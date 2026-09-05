import type { AgenticTurnOutcome } from '../types';

export type ProviderFailureCategory = 'temporary' | 'invalid_request' | 'unsupported' | 'policy' | 'unknown';

export type NormalizedProviderFailure = {
  code: string;
  message: string;
  rawMessage: string;
  retryable: boolean;
  category: ProviderFailureCategory;
};

export type ReassessmentMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: string;
  superseded?: boolean;
};

export type ReassessmentTarget = { messageId: string; content: string };

const CHALLENGE_PATTERNS = [
  /\b(?:that|this)\s+(?:is|was)(?:n't|\s+not)\s+(?:right|correct|true|what\s+it\s+says)\b/i,
  /\byou\s+(?:are|were)\s+(?:wrong|mistaken)\b/i,
  /\byou\s+(?:missed|overlooked|misread|misunderstood)\b/i,
  /\blook\s+(?:again|at\s+it\s+again)\b/i,
  /\bre-?check\b/i,
  /\bare\s+you\s+sure\b/i,
  /\bnot\s+what\s+(?:the\s+)?(?:order|document|filing|record)\s+says\b/i,
  /\byou\s+said\s+(?:the\s+)?opposite\b/i,
  /\bcontradict(?:s|ed|ion)?\b/i,
  /\bwhy\s+(?:did|do|are|were|would)\s+you\b/i,
  /\b(?:check|audit|inspect|explain)\s+(?:your|the)\s+(?:last|previous|prior)\s+(?:answer|response|turn|behavior)\b/i,
  /\bwhy\s+(?:is|was|did)\b.{0,80}\b(?:fail|failed|wrong|happen|happened)\b/i,
];

function errorRecord(error: unknown) {
  return error && typeof error === 'object' && !Array.isArray(error)
    ? error as Record<string, unknown>
    : {};
}

/** Classify failures without pretending an unknown condition is safe to retry. */
export function normalizeProviderFailure(error: unknown): NormalizedProviderFailure {
  const record = errorRecord(error);
  const nested = errorRecord(record.error);
  const rawMessage = error instanceof Error
    ? error.message
    : typeof record.message === 'string'
      ? record.message
      : String(error ?? 'Unknown provider failure');
  const lower = rawMessage.toLowerCase();
  const status = typeof record.status === 'number'
    ? record.status
    : typeof record.statusCode === 'number'
      ? record.statusCode
      : typeof nested.status === 'number'
        ? nested.status
        : undefined;
  const providerCode = [record.code, nested.code, record.type, nested.type]
    .find((value): value is string => typeof value === 'string')
    ?.toLowerCase();

  if (providerCode === 'provider_stream_interrupted' || lower.includes('stream ended before a terminal event')) {
    return { code: 'provider_stream_interrupted', message: 'The response stream was interrupted before completion.', rawMessage, retryable: true, category: 'temporary' };
  }
  if (providerCode === 'provider_stream_timeout' || providerCode === 'provider_stream_inactive') {
    return { code: providerCode, message: 'The response took too long to finish.', rawMessage, retryable: true, category: 'temporary' };
  }
  if (providerCode === 'provider_output_incomplete') {
    return { code: 'provider_output_incomplete', message: 'The response stopped before all output was returned.', rawMessage, retryable: true, category: 'temporary' };
  }
  if (providerCode === 'provider_stream_failed') {
    const retryable = record.retryable === true;
    return {
      code: 'provider_stream_failed',
      message: retryable ? 'The response stream failed temporarily.' : 'The response stream could not be completed.',
      rawMessage,
      retryable,
      category: retryable ? 'temporary' : 'unknown',
    };
  }

  if (status === 429 || lower.includes('rate limit') || providerCode?.includes('rate_limit')) {
    return { code: 'provider_rate_limit', message: 'The model service was temporarily busy.', rawMessage, retryable: true, category: 'temporary' };
  }
  if (status === 408 || lower.includes('timeout') || lower.includes('timed out') || providerCode === 'etimedout') {
    return { code: 'provider_timeout', message: 'The response took too long to finish.', rawMessage, retryable: true, category: 'temporary' };
  }
  if ((status !== undefined && status >= 500) || lower.includes('overloaded') || lower.includes('temporarily unavailable')) {
    return { code: 'provider_unavailable', message: 'The model service was temporarily unavailable.', rawMessage, retryable: true, category: 'temporary' };
  }
  if (status === 401 || status === 403 || lower.includes('permission') || lower.includes('authentication')) {
    return { code: 'provider_configuration_error', message: 'NEXXproof is not currently configured to complete this request.', rawMessage, retryable: false, category: 'unsupported' };
  }
  if (lower.includes('content policy') || lower.includes('safety') || lower.includes('refusal')) {
    return { code: 'provider_policy_boundary', message: 'This request could not be completed within the available safety rules.', rawMessage, retryable: false, category: 'policy' };
  }
  if (
    status === 400 || status === 404 || status === 413 || status === 415 || status === 422 ||
    lower.includes('invalid request') || lower.includes('unsupported media')
  ) {
    return { code: 'provider_invalid_request', message: 'The request could not be completed in its current form.', rawMessage, retryable: false, category: 'invalid_request' };
  }
  if (lower.includes('schema') || lower.includes('json') || lower.includes('structured_output_recovery_failed')) {
    return { code: 'provider_schema_error', message: 'The answer could not be validated safely.', rawMessage, retryable: true, category: 'temporary' };
  }
  return { code: 'provider_unknown_failure', message: 'NEXXproof could not determine a safe way to finish this response.', rawMessage, retryable: false, category: 'unknown' };
}

export function isReassessmentRequest(message: string) {
  return CHALLENGE_PATTERNS.some((pattern) => pattern.test(message));
}

export function findReassessmentTarget(message: string, recentMessages: ReassessmentMessage[]): ReassessmentTarget | null {
  if (!isReassessmentRequest(message)) return null;
  const target = [...recentMessages].reverse().find((candidate) =>
    candidate.role === 'assistant' &&
    !candidate.superseded &&
    (candidate.status === undefined || candidate.status === 'committed') &&
    candidate.content.trim().length > 0
  );
  return target ? { messageId: target.id, content: target.content } : null;
}

export function buildReassessmentPrompt(target: ReassessmentTarget) {
  return [
    'The user is challenging a prior NEXXproof answer. This is a reassessment turn.',
    `Target assistant message ID: ${target.messageId}`,
    'Re-open the available conversation evidence, uploaded-document passages, and tool results before deciding whether the target was wrong, incomplete, ambiguous, or upheld.',
    'Do not defend the old answer automatically. If it was wrong, say plainly that NEXXproof made a mistake, give the corrected answer, state what earlier advice changes, and provide the best next step.',
    'If it remains supported, say it was rechecked and identify the controlling evidence and any remaining uncertainty.',
    'Set agenticOutcome.status to corrected or rechecked_upheld and populate agenticOutcome.correction. Use the exact target message ID above.',
    `Prior answer being challenged:\n${target.content.slice(0, 12_000)}`,
  ].join('\n\n');
}

export function completeAgenticOutcome(completed: string[] = ['Answered the user request']): AgenticTurnOutcome {
  return { status: 'complete', completed, missing: [], blockedReason: null, retryable: false, nextBestAction: null, correction: null };
}

export function recoveryAgenticOutcome(args: { retryable: boolean; reason: string; hasSavedDocument: boolean }): AgenticTurnOutcome {
  return {
    status: args.retryable ? 'temporarily_blocked' : 'unsupported',
    completed: args.hasSavedDocument ? ['Saved the message and uploaded document'] : ['Saved the message'],
    missing: [],
    blockedReason: args.reason,
    retryable: args.retryable,
    nextBestAction: args.retryable
      ? { kind: 'retry', label: 'Try again', prompt: 'Retry this response using the saved conversation state.' }
      : { kind: 'external_steps', label: null, prompt: 'Explain the closest supported path forward.' },
    correction: null,
  };
}

export function buildSavedWorkFailureMessage(args: { retryable: boolean; hasSavedDocument: boolean; reason: string }) {
  const saved = args.hasSavedDocument ? 'Your message and uploaded document are saved.' : 'Your message is saved.';
  return args.retryable
    ? `${saved} I could not finish the answer because ${args.reason.toLowerCase()} Try this response again; I will reuse the work already completed.`
    : `${saved} I cannot complete this request in its current form because ${args.reason.toLowerCase()} I can still help you identify the closest supported next step.`;
}

export function finalizeAgenticOutcome(outcome: AgenticTurnOutcome | undefined, reassessmentTarget?: ReassessmentTarget | null): AgenticTurnOutcome {
  const normalized = outcome ?? completeAgenticOutcome();
  if (!reassessmentTarget) return { ...normalized, correction: null };
  const finding = normalized.correction?.finding ?? 'ambiguous';
  return {
    ...normalized,
    status: finding === 'upheld' ? 'rechecked_upheld' : 'corrected',
    correction: {
      targetMessageId: reassessmentTarget.messageId,
      finding,
      summary: normalized.correction?.summary || 'Reassessed the challenged answer against the available record.',
      invalidatedFactIds: normalized.correction?.invalidatedFactIds ?? [],
      invalidatedArtifactIds: normalized.correction?.invalidatedArtifactIds ?? [],
    },
  };
}
