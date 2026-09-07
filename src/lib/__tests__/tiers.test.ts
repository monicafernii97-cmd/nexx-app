import { describe, expect, it } from 'vitest';
import { ECONOMY_MODEL, PRIMARY_MODEL, PRO_MODEL, getModelForRoute } from '../tiers';

describe('chat model policy', () => {
  it('uses Luna for low-risk conversation and Terra for legal work', () => {
    expect(getModelForRoute('free', 'economy_chat')).toBe(ECONOMY_MODEL);
    expect(getModelForRoute('free', 'chat')).toBe(PRIMARY_MODEL);
    expect(getModelForRoute('premium', 'analysis')).toBe(PRIMARY_MODEL);
  });

  it('reserves Sol for entitled premium workflows', () => {
    expect(getModelForRoute('free', 'deep_draft')).toBe(PRIMARY_MODEL);
    expect(getModelForRoute('premium', 'deep_draft')).toBe(PRO_MODEL);
  });
});
