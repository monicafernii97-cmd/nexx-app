import { describe, expect, it } from 'vitest';
import { estimateProviderCostMicrousd, extractProviderTokenUsage } from '../provider/usageAccounting';

describe('provider usage accounting', () => {
  it('records actual and cached token counts from a Responses completion', () => {
    const usage = extractProviderTokenUsage({
      usage: {
        input_tokens: 1_000,
        input_tokens_details: { cached_tokens: 600 },
        output_tokens: 200,
        output_tokens_details: { reasoning_tokens: 80 },
        total_tokens: 1_200,
      },
    });

    expect(usage).toEqual({
      inputTokens: 1_000,
      cachedInputTokens: 600,
      outputTokens: 200,
      reasoningTokens: 80,
      totalTokens: 1_200,
    });
    expect(estimateProviderCostMicrousd('gpt-5.6-terra', usage)).toBe(3_320);
  });

  it('leaves cost unknown for an unpriced model instead of inventing a value', () => {
    const usage = { inputTokens: 100, outputTokens: 50 };
    expect(estimateProviderCostMicrousd('future-model', usage)).toBeUndefined();
  });
});
