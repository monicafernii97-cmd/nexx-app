import { NextRequest } from 'next/server';
import { stripe, getTierForPriceId } from '@/lib/stripe';
import { getConvexClient } from '@/lib/convexServer';
import { api } from '@convex/_generated/api';
import type Stripe from 'stripe';

type SubscriptionTier = 'free' | 'pro' | 'premium' | 'executive';
const VALID_TIERS: SubscriptionTier[] = ['free', 'pro', 'premium', 'executive'];

/** Type guard to validate a string is a valid subscription tier. */
function isValidTier(tier: string): tier is SubscriptionTier {
    return VALID_TIERS.includes(tier as SubscriptionTier);
}

/** All 8 Stripe subscription statuses. */
const VALID_STATUSES = ['active', 'canceled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'] as const;
type StripeStatus = typeof VALID_STATUSES[number];

/**
 * Safely extract a string customer ID from Stripe's customer field.
 * Returns null when the customer cannot be resolved.
 */
function resolveCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
    if (typeof customer === 'string') return customer;
    if (customer && 'id' in customer) return customer.id;
    return null;
}

/** Get the server secret used for mutation authorization. */
function getServerSecret(): string {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured');
    return secret;
}

/** Stripe webhook handler — processes subscription lifecycle events. */
export async function POST(req: NextRequest) {
    const body = await req.text();
    const sig = req.headers.get('stripe-signature');

    if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
        return Response.json({ error: 'Missing signature or webhook secret' }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('[Stripe Webhook] Signature verification failed:', err);
        return Response.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const convex = getConvexClient();
    const serverSecret = getServerSecret();

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                const clerkId = session.metadata?.clerkId;
                const tier = session.metadata?.tier;

                if (!clerkId) {
                    console.warn('[Stripe Webhook] checkout.session.completed missing clerkId in metadata', {
                        sessionId: session.id,
                    });
                    break;
                }

                if (tier && session.subscription) {
                    const subscriptionId = typeof session.subscription === 'string'
                        ? session.subscription
                        : session.subscription.id;

                    const customerId = resolveCustomerId(session.customer);
                    if (!customerId) {
                        console.error('[Stripe Webhook] checkout.session.completed missing customer ID', {
                            sessionId: session.id,
                        });
                        break;
                    }

                    await convex.mutation(api.stripe.updateSubscription, {
                        serverSecret,
                        clerkId,
                        stripeCustomerId: customerId,
                        stripeSubscriptionId: subscriptionId,
                        stripePriceId: '',  // Will be set by subscription.updated
                        subscriptionTier: isValidTier(tier) ? tier : 'free',
                        subscriptionStatus: 'active',
                    });
                }
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object as Stripe.Subscription;
                const clerkId = subscription.metadata?.clerkId;
                const priceId = subscription.items.data[0]?.price?.id;
                const tier = priceId ? getTierForPriceId(priceId) : undefined;

                if (!clerkId) {
                    console.warn('[Stripe Webhook] subscription.updated missing clerkId in metadata', {
                        subscriptionId: subscription.id,
                        customerId: resolveCustomerId(subscription.customer),
                    });
                    break;
                }

                const customerId = resolveCustomerId(subscription.customer);
                if (!customerId) {
                    console.error('[Stripe Webhook] subscription.updated missing customer ID', {
                        subscriptionId: subscription.id,
                    });
                    break;
                }

                // If priceId exists but tier mapping is unknown, log and skip
                // to avoid silently downgrading a paid subscriber to free.
                if (priceId && !tier) {
                    console.warn('[Stripe Webhook] Unmapped priceId in subscription.updated — skipping tier update', {
                        subscriptionId: subscription.id,
                        priceId,
                    });
                    break;
                }

                // Preserve the raw Stripe status — schema supports all 8 values
                const rawStatus = subscription.status as string;
                const status: StripeStatus = VALID_STATUSES.includes(rawStatus as StripeStatus)
                    ? (rawStatus as StripeStatus)
                    : (() => {
                        console.warn('[Stripe Webhook] Unknown subscription status:', rawStatus);
                        return 'active' as StripeStatus;
                    })();

                await convex.mutation(api.stripe.updateSubscription, {
                    serverSecret,
                    clerkId,
                    stripeCustomerId: customerId,
                    stripeSubscriptionId: subscription.id,
                    stripePriceId: priceId ?? '',
                    subscriptionTier: (tier && isValidTier(tier)) ? tier : 'free',
                    subscriptionStatus: status,
                });
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription;
                const clerkId = subscription.metadata?.clerkId;

                if (!clerkId) {
                    console.warn('[Stripe Webhook] subscription.deleted missing clerkId in metadata', {
                        subscriptionId: subscription.id,
                        customerId: resolveCustomerId(subscription.customer),
                    });
                    break;
                }

                const customerId = resolveCustomerId(subscription.customer);
                if (!customerId) {
                    console.error('[Stripe Webhook] subscription.deleted missing customer ID', {
                        subscriptionId: subscription.id,
                    });
                    break;
                }

                await convex.mutation(api.stripe.updateSubscription, {
                    serverSecret,
                    clerkId,
                    stripeCustomerId: customerId,
                    stripeSubscriptionId: '',
                    stripePriceId: '',
                    subscriptionTier: 'free',
                    subscriptionStatus: 'canceled',
                });
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object as Stripe.Invoice;
                // Invoice.subscription can be string | Stripe.Subscription | null
                const rawSub = (invoice as unknown as Record<string, unknown>).subscription;
                const subscriptionId = typeof rawSub === 'string'
                    ? rawSub
                    : typeof rawSub === 'object' && rawSub !== null && 'id' in rawSub
                        ? (rawSub as { id: string }).id
                        : undefined;

                if (!subscriptionId) {
                    console.warn('[Stripe Webhook] invoice.payment_failed has no subscription', {
                        invoiceId: invoice.id,
                    });
                    break;
                }

                // Fetch subscription to get clerkId from metadata — wrapped in
                // try/catch so a Stripe API failure doesn't cause a 500 and endless retries.
                let subscription: Stripe.Subscription;
                try {
                    subscription = await stripe.subscriptions.retrieve(subscriptionId);
                } catch (err) {
                    console.error('[Stripe Webhook] Failed to retrieve subscription for payment_failed', {
                        subscriptionId,
                        error: err,
                    });
                    break; // Acknowledge webhook but skip update
                }

                const clerkId = subscription.metadata?.clerkId;

                if (!clerkId) {
                    console.warn('[Stripe Webhook] invoice.payment_failed subscription missing clerkId', {
                        subscriptionId,
                        customerId: resolveCustomerId(subscription.customer),
                    });
                    break;
                }

                const customerId = resolveCustomerId(subscription.customer);
                if (!customerId) {
                    console.error('[Stripe Webhook] invoice.payment_failed missing customer ID', {
                        subscriptionId,
                    });
                    break;
                }

                const priceId = subscription.items.data[0]?.price?.id;
                const tier = priceId ? getTierForPriceId(priceId) : 'free';

                // Skip tier update if priceId exists but mapping is unknown
                if (priceId && !tier) {
                    console.warn('[Stripe Webhook] Unmapped priceId in payment_failed — skipping tier update', {
                        subscriptionId,
                        priceId,
                    });
                    break;
                }

                await convex.mutation(api.stripe.updateSubscription, {
                    serverSecret,
                    clerkId,
                    stripeCustomerId: customerId,
                    stripeSubscriptionId: subscription.id,
                    stripePriceId: priceId ?? '',
                    subscriptionTier: (typeof tier === 'string' && isValidTier(tier)) ? tier : 'free',
                    subscriptionStatus: 'past_due',
                });
                break;
            }

            default:
                // Unhandled event type — acknowledge receipt
                break;
        }

        return Response.json({ received: true });
    } catch (error) {
        console.error('[Stripe Webhook] Processing error:', error);
        return Response.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
}
