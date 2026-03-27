/**
 * Subscription Tiers & AI Model Routing
 *
 * Defines the subscription tiers, their daily GPT-4o / GPT-4o-mini usage caps,
 * and helpers to determine which model to use based on conversation mode.
 */

// ── Tier Definition ──

export type SubscriptionTier = 'free' | 'pro' | 'premium' | 'executive';

/** Paid tiers only — used for checkout validation. */
export type PaidSubscriptionTier = Exclude<SubscriptionTier, 'free'>;
export const PAID_TIERS: PaidSubscriptionTier[] = ['pro', 'premium', 'executive'];

/** Check if a tier string is a valid paid tier. */
export function isPaidTier(tier: string): tier is PaidSubscriptionTier {
    return PAID_TIERS.includes(tier as PaidSubscriptionTier);
}

interface TierConfig {
    /** Display name for UI */
    label: string;
    /** Monthly price in USD */
    priceUsd: number;
    /** Daily GPT-4o message cap (-1 = unlimited) */
    gpt4oDailyLimit: number;
    /** Daily GPT-4o-mini message cap (-1 = unlimited) */
    gpt4oMiniDailyLimit: number;
}

export const TIER_LIMITS: Record<SubscriptionTier, TierConfig> = {
    free: {
        label: 'Free',
        priceUsd: 0,
        gpt4oDailyLimit: 10,
        gpt4oMiniDailyLimit: -1, // unlimited fallback
    },
    pro: {
        label: 'Pro',
        priceUsd: 29.99,
        gpt4oDailyLimit: 75,
        gpt4oMiniDailyLimit: -1, // unlimited fallback
    },
    premium: {
        label: 'Premium',
        priceUsd: 49.99,
        gpt4oDailyLimit: 200,
        gpt4oMiniDailyLimit: -1, // unlimited fallback
    },
    executive: {
        label: 'Executive',
        priceUsd: 149.99,
        gpt4oDailyLimit: -1, // unlimited
        gpt4oMiniDailyLimit: -1,
    },
};

// ── Model Routing ──

export type ChatMode = 'general';

export const PREMIUM_MODEL = 'gpt-4o' as const;
export const FALLBACK_MODEL = 'gpt-4o-mini' as const;

/**
 * Determine the OpenAI model to use.
 * All conversations now use GPT-4o for maximum response quality.
 * @deprecated Mode parameter is no longer used — kept for API backward compat.
 */
export function getModelForMode(): typeof PREMIUM_MODEL {
    return PREMIUM_MODEL;
}

/**
 * Returns whether the selected model is the premium GPT-4o model.
 */
export function isPremiumModel(model: string): boolean {
    return model === PREMIUM_MODEL;
}

/**
 * Get the daily message cap for a given tier and model.
 * Returns -1 for unlimited, 0 for unknown/unsupported models (fail-closed).
 */
export function getDailyLimit(tier: SubscriptionTier, model: string): number {
    const config = TIER_LIMITS[tier] ?? TIER_LIMITS.free;
    if (model === PREMIUM_MODEL) return config.gpt4oDailyLimit;
    if (model === FALLBACK_MODEL) return config.gpt4oMiniDailyLimit;
    // Unknown model — fail-closed to prevent bypassing quota
    console.warn('[Tiers] getDailyLimit called with unknown model:', model);
    return 0;
}
