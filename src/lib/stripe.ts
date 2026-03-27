/** Stripe server-side SDK initialization and tier ↔ price mapping. */
import Stripe from 'stripe';

// ── Lazy Stripe client ──
// Initialized on first use (not at module load) so the build doesn't
// crash when STRIPE_SECRET_KEY isn't available in the CI environment.

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
    if (!_stripe) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) {
            throw new Error('Missing STRIPE_SECRET_KEY environment variable');
        }
        _stripe = new Stripe(key, { typescript: true });
    }
    return _stripe;
}

/** @deprecated Use getStripe() instead — kept for convenience in route files. */
export const stripe = new Proxy({} as Stripe, {
    get(_target, prop) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (getStripe() as any)[prop];
    },
});

// ── Tier ↔ Stripe Price ID mapping ──

function getPriceMap(): Record<string, string> {
    return {
        pro: process.env.STRIPE_PRICE_PRO ?? '',
        premium: process.env.STRIPE_PRICE_PREMIUM ?? '',
        executive: process.env.STRIPE_PRICE_EXECUTIVE ?? '',
    };
}

/** Get the Stripe Price ID for a given subscription tier. */
export function getPriceIdForTier(tier: string): string | undefined {
    return getPriceMap()[tier];
}

/** Get the subscription tier for a given Stripe Price ID. */
export function getTierForPriceId(priceId: string): string | undefined {
    const map = getPriceMap();
    const entry = Object.entries(map).find(([, id]) => id === priceId);
    return entry?.[0];
}
