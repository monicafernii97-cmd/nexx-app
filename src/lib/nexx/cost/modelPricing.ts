export const MODEL_PRICING_VERSION = 'openai-2026-09-07' as const;

export type ModelPrice = {
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  'gpt-5.6-luna': { inputUsdPerMillion: 0.2, cachedInputUsdPerMillion: 0.02, outputUsdPerMillion: 1.2 },
  'gpt-5.6-terra': { inputUsdPerMillion: 2, cachedInputUsdPerMillion: 0.2, outputUsdPerMillion: 12 },
  'gpt-5.6-sol': { inputUsdPerMillion: 4, cachedInputUsdPerMillion: 0.4, outputUsdPerMillion: 20 },
  'gpt-5.4': { inputUsdPerMillion: 2.5, cachedInputUsdPerMillion: 0.25, outputUsdPerMillion: 15 },
  'gpt-5.4-mini': { inputUsdPerMillion: 0.75, cachedInputUsdPerMillion: 0.075, outputUsdPerMillion: 4.5 },
};

export function priceForModel(model: string) {
  return MODEL_PRICES[model];
}
