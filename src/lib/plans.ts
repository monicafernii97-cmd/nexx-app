/**
 * Shared plan definitions used on the landing page and potentially
 * the subscription/onboarding pages to keep pricing and features in sync.
 *
 * Quota feature strings (premium/standard AI responses) are derived
 * from TIER_LIMITS so there is a single source of truth for limits.
 */

import { TIER_LIMITS, type SubscriptionTier } from './tiers';

/** Alias for SubscriptionTier — single source of truth lives in tiers.ts */
export type PlanTier = SubscriptionTier;
export interface PlanDefinition {
    name: string;
    tier: PlanTier;
    price: string;
    period: string;
    description: string;
    badge: string | null;
    features: string[];
    cta: string;
    accent: string;
    borderAccent: string;
    popular: boolean;
}

/** Format a daily limit value for plan feature display. */
function formatLimit(limit: number, label: string): string {
    return limit === -1 ? `Unlimited ${label}` : `${limit} ${label}`;
}

/** Build the AI quota feature lines from TIER_LIMITS for a given tier. */
function buildAIQuotaFeatures(tier: PlanTier): string[] {
    const config = TIER_LIMITS[tier];
    const premiumLine = formatLimit(config.gpt4oDailyLimit, 'premium AI responses per day');
    // Only show the standard line if it differs from the premium line (i.e. there IS a cap)
    if (config.gpt4oDailyLimit === -1) {
        return [premiumLine];
    }
    const standardLine = formatLimit(config.gpt4oMiniDailyLimit, 'standard AI responses');
    return [premiumLine, standardLine];
}

export const PLANS: PlanDefinition[] = [
    {
        name: 'Free',
        tier: 'free',
        price: '$0',
        period: 'forever',
        description: 'Start documenting incidents and explore what NEXX can do — completely free.',
        badge: null,
        features: [
            ...buildAIQuotaFeatures('free'),
            '3 legal document generations per month',
            '3 court rules lookups per month',
            'Basic incident reporting & analysis',
        ],
        cta: 'Start Free',
        accent: 'rgba(255,255,255,0.1)',
        borderAccent: 'rgba(255,255,255,0.08)',
        popular: false,
    },
    {
        name: 'Pro',
        tier: 'pro',
        price: '$29.99',
        period: '/month',
        description: 'For parents ready to build a strong, evidence-backed case with expanded access to every tool.',
        badge: null,
        features: [
            ...buildAIQuotaFeatures('pro'),
            'Unlimited legal document generation',
            'Unlimited incident analysis & timeline reports',
            'Full county resource finder & court rules lookup',
        ],
        cta: 'Go Pro',
        accent: 'rgba(26,75,155,0.3)',
        borderAccent: 'rgba(26,75,155,0.4)',
        popular: false,
    },
    {
        name: 'Premium',
        tier: 'premium',
        price: '$49.99',
        period: '/month',
        description: 'Our most popular plan — built for parents actively navigating custody, family law, or high-conflict cases.',
        badge: 'Most Popular',
        features: [
            ...buildAIQuotaFeatures('premium'),
            'Unlimited document generation & DocuVault access',
            'Advanced court compliance verification',
            'Unlimited access to local legal resources',
        ],
        cta: 'Go Premium',
        accent: 'rgba(229,168,74,0.15)',
        borderAccent: 'rgba(229,168,74,0.35)',
        popular: true,
    },
    {
        name: 'Executive',
        tier: 'executive',
        price: '$149.99',
        period: '/month',
        description: 'No daily caps. No restrictions. Full, unrestricted access to every NEXX feature.',
        badge: 'Elite',
        features: [
            ...buildAIQuotaFeatures('executive'),
            'Unlimited document generation & template gallery',
            'Unlimited incident analysis & timeline reports',
            'Unlimited compliance verification & court rule lookups',
            'Dedicated family code search tailored to your location',
        ],
        cta: 'Go Executive',
        accent: 'rgba(229,168,74,0.25)',
        borderAccent: 'rgba(229,168,74,0.5)',
        popular: false,
    },
];
