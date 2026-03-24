/**
 * Shared plan definitions used on the landing page and potentially
 * the subscription/onboarding pages to keep pricing and features in sync.
 */

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

// Re-export canonical tier type from tiers.ts to avoid duplicate definitions
export { type SubscriptionTier as PlanTier } from './tiers';

export const PLANS: PlanDefinition[] = [
    {
        name: 'Free',
        tier: 'free',
        price: '$0',
        period: 'forever',
        description: 'Start documenting incidents and explore what NEXX can do — completely free.',
        badge: null,
        features: [
            '5 legal guidance messages per day',
            '50 NEXX Chat messages per day',
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
            '50 legal guidance messages per day',
            'Unlimited NEXX Chat',
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
            '100 legal guidance messages per day',
            'Unlimited NEXX Chat',
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
            'Unlimited legal guidance messages',
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
