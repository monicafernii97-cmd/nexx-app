import {
  FALLBACK_MODEL,
  FALLBACK_MODEL_54,
  PREMIUM_MODEL,
  PRIMARY_MODEL,
  PRO_MODEL,
  type SubscriptionTier,
} from '../../src/lib/tiers';

export const CHAT_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function fixedWindowStartMs(now: number, windowMs: number) {
  return Math.floor(now / windowMs) * windowMs;
}

export function userSubscriptionTier(user: { subscriptionTier?: string }): SubscriptionTier {
  return user.subscriptionTier === 'pro' ||
    user.subscriptionTier === 'premium' ||
    user.subscriptionTier === 'executive'
    ? user.subscriptionTier
    : 'free';
}

export function chatRateLimitKeyForModel(model: string) {
  if (model === PRIMARY_MODEL) return 'chat_message:gpt_5_4';
  if (model === PRO_MODEL) return 'chat_message:gpt_5_4_pro';
  if (model === FALLBACK_MODEL || model === FALLBACK_MODEL_54) return 'chat_message:gpt_5_4_mini';
  if (model === PREMIUM_MODEL) return 'chat_message:gpt_4o';
  return `chat_message:${model.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
}
