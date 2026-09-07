import { priceForModel } from '../cost/modelPricing';

export type ProviderTokenUsage = {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
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
  const price = priceForModel(model);
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
