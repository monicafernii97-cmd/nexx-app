/** Stripe server-side SDK initialization and tier ↔ price mapping. */
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    typescript: true,
});

// ── Tier ↔ Stripe Price ID mapping ──

const PRICE_MAP: Record<string, string> = {
    pro: process.env.STRIPE_PRICE_PRO ?? '',
    premium: process.env.STRIPE_PRICE_PREMIUM ?? '',
    executive: process.env.STRIPE_PRICE_EXECUTIVE ?? '',
};

const REVERSE_PRICE_MAP: Record<string, string> = Object.fromEntries(
    Object.entries(PRICE_MAP).map(([tier, priceId]) => [priceId, tier])
);

/** Get the Stripe Price ID for a given subscription tier. */
export function getPriceIdForTier(tier: string): string | undefined {
    return PRICE_MAP[tier];
}

/** Get the subscription tier for a given Stripe Price ID. */
export function getTierForPriceId(priceId: string): string | undefined {
    return REVERSE_PRICE_MAP[priceId];
}
