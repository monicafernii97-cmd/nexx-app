/**
 * Subscription Tiers & AI Model Routing
 *
 * Defines the subscription tiers, their daily GPT-4o / GPT-4o-mini usage caps,
 * and helpers to determine which model to use based on conversation mode.
 */

// ── Tier Definition ──

export type SubscriptionTier = 'free' | 'pro' | 'premium' | 'executive';

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
        gpt4oDailyLimit: 5,
        gpt4oMiniDailyLimit: 50,
    },
    pro: {
        label: 'Pro',
        priceUsd: 29.99,
        gpt4oDailyLimit: 50,
        gpt4oMiniDailyLimit: -1, // unlimited
    },
    premium: {
        label: 'Premium',
        priceUsd: 49.99,
        gpt4oDailyLimit: 100,
        gpt4oMiniDailyLimit: -1,
    },
    executive: {
        label: 'Executive',
        priceUsd: 149.99,
        gpt4oDailyLimit: -1,
        gpt4oMiniDailyLimit: -1,
    },
};

// ── Model Routing ──

export type ChatMode = 'therapeutic' | 'legal' | 'strategic' | 'general';

const PREMIUM_MODEL = 'gpt-4o' as const;
const STANDARD_MODEL = 'gpt-4o-mini' as const;

/**
 * Determine the OpenAI model to use based on the conversation mode.
 * Legal & strategic modes get GPT-4o; therapeutic & general get GPT-4o-mini.
 */
export function getModelForMode(mode?: string): typeof PREMIUM_MODEL | typeof STANDARD_MODEL {
    if (mode === 'legal' || mode === 'strategic') {
        return PREMIUM_MODEL;
    }
    return STANDARD_MODEL;
}

/**
 * Returns whether the selected model is the premium GPT-4o model.
 */
export function isPremiumModel(model: string): boolean {
    return model === PREMIUM_MODEL;
}

/**
 * Get the daily message cap for a given tier and model.
 * Returns -1 for unlimited.
 */
export function getDailyLimit(tier: SubscriptionTier, model: string): number {
    const config = TIER_LIMITS[tier] ?? TIER_LIMITS.free;
    return model === PREMIUM_MODEL ? config.gpt4oDailyLimit : config.gpt4oMiniDailyLimit;
}
