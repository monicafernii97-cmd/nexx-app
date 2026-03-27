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

/**
 * Proxy-based Stripe client for convenience — delegates to getStripe().
 * Binds methods to the instance so destructured usage works correctly.
 * TODO: Remove this proxy once all route files have been migrated to use
 * getStripe() directly. Tracked for removal in the next major refactor.
 */
export const stripe = new Proxy({} as Stripe, {
    get(_target, prop) {
        const instance = getStripe();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const val = (instance as any)[prop];
        // Bind functions to the Stripe instance to preserve `this` context
        return typeof val === 'function' ? val.bind(instance) : val;
    },
});

// ── Tier ↔ Stripe Price ID mapping ──

function getPriceMap(): Record<string, string | undefined> {
    return {
        pro: process.env.STRIPE_PRICE_PRO || undefined,
        premium: process.env.STRIPE_PRICE_PREMIUM || undefined,
        executive: process.env.STRIPE_PRICE_EXECUTIVE || undefined,
    };
}

/** Get the Stripe Price ID for a given subscription tier. Returns undefined if unset. */
export function getPriceIdForTier(tier: string): string | undefined {
    return getPriceMap()[tier];
}

/** Get the subscription tier for a given Stripe Price ID. Ignores unset env vars. */
export function getTierForPriceId(priceId: string): string | undefined {
    if (!priceId) return undefined;
    const map = getPriceMap();
    const entry = Object.entries(map).find(([, id]) => id && id === priceId);
    return entry?.[0];
}
