import { describe, expect, it } from 'vitest';
import { toProviderInputMessages } from '../providerInput';

describe('toProviderInputMessages', () => {
  it('strips internal turn metadata before provider calls', () => {
    expect(
      toProviderInputMessages([
        {
          turnId: 'turn-1',
          role: 'user',
          content: 'Analyze the uploaded order.',
          status: 'committed',
        },
        {
          turnId: 'turn-2',
          role: 'assistant',
          content: 'Prior answer.',
          status: 'degraded',
        },
      ])
    ).toEqual([
      { role: 'user', content: 'Analyze the uploaded order.' },
      { role: 'assistant', content: 'Prior answer.' },
    ]);
  });
});
