/**
 * Subscription Tiers & AI Model Routing
 *
 * Defines the subscription tiers, their daily usage caps,
 * and helpers to determine which model to use based on tier and feature.
 * 
 * Model hierarchy (Responses API era):
 * - gpt-5.4: Primary model for all chat + analysis
 * - gpt-5.4-mini: Fallback, memory compaction, confidence assessment
 * - gpt-5.4-pro: Premium workflows (judge sim, opposition sim, deep drafting)
 * - gpt-4o: Legacy routes still in transition
 * - gpt-4o-mini: Legacy fallback
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
    /** NEW: Daily GPT-5.4 message cap (-1 = unlimited) */
    gpt54DailyLimit: number;
    /** NEW: Daily GPT-5.4-pro message cap (for simulations/deep drafting) */
    gpt54ProDailyLimit: number;
}

export const TIER_LIMITS: Record<SubscriptionTier, TierConfig> = {
    free: {
        label: 'Free',
        priceUsd: 0,
        gpt4oDailyLimit: 10,
        gpt4oMiniDailyLimit: -1,
        gpt54DailyLimit: 10,
        gpt54ProDailyLimit: 0,      // No pro access on free tier
    },
    pro: {
        label: 'Pro',
        priceUsd: 29.99,
        gpt4oDailyLimit: 75,
        gpt4oMiniDailyLimit: -1,
        gpt54DailyLimit: 75,
        gpt54ProDailyLimit: 5,
    },
    premium: {
        label: 'Premium',
        priceUsd: 49.99,
        gpt4oDailyLimit: 200,
        gpt4oMiniDailyLimit: -1,
        gpt54DailyLimit: 200,
        gpt54ProDailyLimit: 20,
    },
    executive: {
        label: 'Executive',
        priceUsd: 149.99,
        gpt4oDailyLimit: -1,
        gpt4oMiniDailyLimit: -1,
        gpt54DailyLimit: -1,
        gpt54ProDailyLimit: -1,
    },
};

// ── Model Constants ──

/** @deprecated Use PRIMARY_MODEL for new Responses API routes */
export const PREMIUM_MODEL = 'gpt-4o' as const;
/** @deprecated Use FALLBACK_MODEL_54 for new routes */
export const FALLBACK_MODEL = 'gpt-4o-mini' as const;

/** NEW: Responses API era model constants */
export const PRIMARY_MODEL = 'gpt-5.4' as const;
export const FALLBACK_MODEL_54 = 'gpt-5.4-mini' as const;
export const PRO_MODEL = 'gpt-5.4-pro' as const;

// ── Model Routing ──

export type ChatMode = 'general';

/**
 * Determine the OpenAI model to use for legacy routes.
 * @deprecated Use getModelForRoute() for new Responses API routes.
 */
export function getModelForMode(): typeof PREMIUM_MODEL {
    return PREMIUM_MODEL;
}

/**
 * NEW: Get the model for a specific route/feature combination.
 * Handles tier-based routing and premium feature gating.
 */
export function getModelForRoute(
    tier: SubscriptionTier,
    feature: 'chat' | 'analysis' | 'judge_sim' | 'opposition_sim' | 'deep_draft' | 'memory' | 'confidence'
): string {
    // Memory compaction and confidence always use mini (cost efficiency)
    if (feature === 'memory' || feature === 'confidence') {
        return FALLBACK_MODEL_54;
    }

    // Premium features require pro model + tier access
    if (feature === 'judge_sim' || feature === 'opposition_sim' || feature === 'deep_draft') {
        const limit = TIER_LIMITS[tier]?.gpt54ProDailyLimit ?? 0;
        if (limit === 0) {
            // Tier doesn't have pro access — fall back to primary
            return PRIMARY_MODEL;
        }
        return PRO_MODEL;
    }

    // Chat and analysis use primary model
    return PRIMARY_MODEL;
}

/**
 * Returns whether the selected model is a premium-tier model.
 */
export function isPremiumModel(model: string): boolean {
    return model === PREMIUM_MODEL || model === PRIMARY_MODEL || model === PRO_MODEL;
}

/**
 * Get the daily message cap for a given tier and model.
 * Returns -1 for unlimited, 0 for unknown/unsupported models (fail-closed).
 */
export function getDailyLimit(tier: SubscriptionTier, model: string): number {
    const config = TIER_LIMITS[tier] ?? TIER_LIMITS.free;
    if (model === PRIMARY_MODEL) return config.gpt54DailyLimit;
    if (model === PRO_MODEL) return config.gpt54ProDailyLimit;
    if (model === PREMIUM_MODEL) return config.gpt4oDailyLimit;
    if (model === FALLBACK_MODEL || model === FALLBACK_MODEL_54) return config.gpt4oMiniDailyLimit;
    console.warn('[Tiers] getDailyLimit called with unknown model:', model);
    return 0;
}

