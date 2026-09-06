import type {
  InteractionIntent,
  InteractionResolution,
  PendingOption,
  RecommendationReceipt,
  SemanticClassifierResult,
} from './types';

const INTENTS: InteractionIntent[] = [
  'accept_recommendation', 'accept_offer', 'select_option', 'reject_recommendation',
  'reject_option', 'modify_option', 'cancel_action', 'defer_action', 'ask_about_options',
  'unrelated_turn', 'uncertain',
];

export const SEMANTIC_INTERACTION_CLASSIFIER_SCHEMA = {
  type: 'json_schema' as const,
  name: 'semantic_interaction_classification',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      intent: { type: 'string', enum: INTENTS },
      candidates: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            optionId: { type: 'string' },
            score: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['optionId', 'score'],
        },
      },
      modifiers: { type: 'array', maxItems: 5, items: { type: 'string', maxLength: 160 } },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      reasonCodes: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 80 } },
    },
    required: ['intent', 'candidates', 'modifiers', 'confidence', 'reasonCodes'],
  },
};

function fingerprint(value: unknown) {
  const serialized = JSON.stringify(value);
  let hash = 2166136261;
  for (const character of serialized) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function boundedNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Parse provider output without accepting unknown intents, IDs, or malformed scores. */
export function parseSemanticClassifierResult(value: unknown): SemanticClassifierResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!INTENTS.includes(row.intent as InteractionIntent) || !boundedNumber(row.confidence)) return null;
  if (!Array.isArray(row.candidates) || !Array.isArray(row.modifiers) || !Array.isArray(row.reasonCodes)) return null;
  const candidates = row.candidates.map((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const item = candidate as Record<string, unknown>;
    return typeof item.optionId === 'string' && boundedNumber(item.score)
      ? { optionId: item.optionId, score: item.score as number }
      : null;
  });
  if (candidates.some((candidate) => candidate === null)) return null;
  if (row.modifiers.some((item) => typeof item !== 'string') || row.reasonCodes.some((item) => typeof item !== 'string')) return null;
  return {
    intent: row.intent as InteractionIntent,
    candidates: candidates as Array<{ optionId: string; score: number }>,
    modifiers: (row.modifiers as string[]).map((item) => item.slice(0, 160)).slice(0, 5),
    confidence: row.confidence as number,
    reasonCodes: (row.reasonCodes as string[]).map((item) => item.slice(0, 80)).slice(0, 8),
  };
}

export function buildSemanticClassifierInput(args: {
  message: string;
  options: PendingOption[];
  recommendation?: RecommendationReceipt;
}) {
  return JSON.stringify({
    newestUserMessage: args.message.slice(0, 2_000),
    currentRecommendationOptionId: args.recommendation?.recommendedOptionId ?? null,
    options: args.options.map((option) => ({
      optionId: option.optionId,
      label: option.label,
      aliases: option.aliases.slice(0, 12),
      operationKind: option.operation?.kind ?? option.action,
      analysisMode: option.operation?.kind === 'document_review' ? option.operation.analysisMode : null,
    })),
  });
}

/**
 * Turn a non-authoritative classifier result into an executable resolution.
 * Only a current option can be selected; confidence and candidate separation
 * are enforced here rather than delegated to the model.
 */
export function arbitrateSemanticClassifierResult(args: {
  message: string;
  classification: SemanticClassifierResult;
  options: PendingOption[];
  recommendation?: RecommendationReceipt;
}): InteractionResolution {
  const optionById = new Map(args.options.map((option) => [option.optionId, option]));
  const validCandidates = args.classification.candidates
    .filter((candidate) => optionById.has(candidate.optionId))
    .sort((a, b) => b.score - a.score);
  const unknownOptionNamed = validCandidates.length !== args.classification.candidates.length;
  const recommended = args.recommendation
    ? optionById.get(args.recommendation.recommendedOptionId)
    : undefined;
  const top = validCandidates[0];
  const runnerUp = validCandidates[1];
  const margin = top ? top.score - (runnerUp?.score ?? 0) : 0;
  const intent = args.classification.intent;
  let selected: PendingOption | undefined;
  let decision: InteractionResolution['decision'] = 'clarify';
  const reasonCodes = ['semantic_classifier_consulted', ...args.classification.reasonCodes];

  if (unknownOptionNamed) reasonCodes.push('classifier_unknown_option_id');
  if (!unknownOptionNamed && intent === 'accept_recommendation' && recommended &&
      validCandidates.some((candidate) => candidate.optionId === recommended.optionId)) {
    selected = recommended;
  } else if (!unknownOptionNamed && ['select_option', 'accept_offer'].includes(intent) && top) {
    selected = optionById.get(top.optionId);
  }

  const executionConfident = args.classification.confidence >= 0.86 && Boolean(top) &&
    (validCandidates.length === 1 || margin >= 0.2);
  if (selected && executionConfident && args.classification.modifiers.length === 0) {
    decision = 'execute';
    reasonCodes.push('semantic_classifier_authorized');
  } else if (intent === 'cancel_action') {
    decision = 'cancel';
  } else if (intent === 'defer_action') {
    decision = 'defer';
  } else if (intent === 'reject_option' || intent === 'reject_recommendation') {
    decision = 'rejected';
  } else if (intent === 'unrelated_turn') {
    decision = 'unrelated';
  } else if (args.classification.modifiers.length > 0) {
    reasonCodes.push('semantic_modifier_requires_clarification');
  } else {
    reasonCodes.push('semantic_classifier_low_confidence');
  }

  const candidateOptionIds = validCandidates.map((candidate) => candidate.optionId);
  return {
    resolutionId: `ires_${fingerprint({
      message: args.message.normalize('NFKC').toLowerCase(),
      intent,
      decision,
      candidateOptionIds,
      selectedOptionId: decision === 'execute' ? selected?.optionId : undefined,
      classifier: 'semantic-interaction-model-v1',
    })}`,
    decision,
    intent,
    candidateOptionIds,
    selectedOptionId: decision === 'execute' ? selected?.optionId : undefined,
    recommendationId: args.recommendation?.recommendationId,
    taskId: selected?.targetTaskId,
    operation: decision === 'execute' ? selected?.operation : undefined,
    documentIds: decision === 'execute' ? selected?.documentIds ?? [] : [],
    evidenceGenerationIds: decision === 'execute' ? selected?.evidenceGenerationIds ?? [] : [],
    confidence: args.classification.confidence,
    reasonCodes: Array.from(new Set(reasonCodes)),
  };
}
