export type ProviderTokenUsage = {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
};

type ModelPrice = {
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

const MODEL_PRICES: Record<string, ModelPrice> = {
  'gpt-5.6-luna': { inputUsdPerMillion: 0.2, cachedInputUsdPerMillion: 0.02, outputUsdPerMillion: 1.2 },
  'gpt-5.6-terra': { inputUsdPerMillion: 2, cachedInputUsdPerMillion: 0.2, outputUsdPerMillion: 12 },
  'gpt-5.6-sol': { inputUsdPerMillion: 4, cachedInputUsdPerMillion: 0.4, outputUsdPerMillion: 20 },
  'gpt-5.4': { inputUsdPerMillion: 2.5, cachedInputUsdPerMillion: 0.25, outputUsdPerMillion: 15 },
  'gpt-5.4-mini': { inputUsdPerMillion: 0.75, cachedInputUsdPerMillion: 0.075, outputUsdPerMillion: 4.5 },
};

function finiteTokenCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Extract the provider's final usage object without depending on SDK internals. */
export function extractProviderTokenUsage(response: unknown): ProviderTokenUsage {
  const usage = record(record(response).usage);
  const inputDetails = record(usage.input_tokens_details);
  const outputDetails = record(usage.output_tokens_details);
  return {
    inputTokens: finiteTokenCount(usage.input_tokens),
    cachedInputTokens: finiteTokenCount(inputDetails.cached_tokens),
    outputTokens: finiteTokenCount(usage.output_tokens),
    reasoningTokens: finiteTokenCount(outputDetails.reasoning_tokens),
    totalTokens: finiteTokenCount(usage.total_tokens),
  };
}

/** Estimate provider cost in integer micro-US-dollars using published list prices. */
export function estimateProviderCostMicrousd(model: string, usage: ProviderTokenUsage) {
  const price = MODEL_PRICES[model];
  if (!price || usage.inputTokens === undefined || usage.outputTokens === undefined) return undefined;
  const cached = Math.min(usage.inputTokens, usage.cachedInputTokens ?? 0);
  const uncached = Math.max(0, usage.inputTokens - cached);
  // At a price expressed as USD / 1M tokens, tokenCount * price equals micro-USD.
  return Math.round(
    uncached * price.inputUsdPerMillion +
    cached * price.cachedInputUsdPerMillion +
    usage.outputTokens * price.outputUsdPerMillion,
  );
}
