import { NextRequest } from 'next/server';
import { stripe, getTierForPriceId } from '@/lib/stripe';
import { getConvexClient } from '@/lib/convexServer';
import { api } from '../../../../../convex/_generated/api';
import type Stripe from 'stripe';

/** Safely extract a string customer ID from Stripe's customer field. */
function resolveCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): string {
    if (typeof customer === 'string') return customer;
    if (customer && 'id' in customer) return customer.id;
    return '';
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

                    await convex.mutation(api.stripe.updateSubscription, {
                        clerkId,
                        stripeCustomerId: resolveCustomerId(session.customer),
                        stripeSubscriptionId: subscriptionId,
                        stripePriceId: '',  // Will be set by subscription.updated
                        subscriptionTier: tier,
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

                const status = subscription.status === 'active' || subscription.status === 'trialing'
                    ? 'active'
                    : subscription.status === 'past_due'
                        ? 'past_due'
                        : subscription.status === 'canceled'
                            ? 'canceled'
                            : 'active';

                await convex.mutation(api.stripe.updateSubscription, {
                    clerkId,
                    stripeCustomerId: resolveCustomerId(subscription.customer),
                    stripeSubscriptionId: subscription.id,
                    stripePriceId: priceId ?? '',
                    subscriptionTier: tier ?? 'free',
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

                await convex.mutation(api.stripe.updateSubscription, {
                    clerkId,
                    stripeCustomerId: resolveCustomerId(subscription.customer),
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

                // Fetch subscription to get clerkId from metadata
                const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                const clerkId = subscription.metadata?.clerkId;

                if (!clerkId) {
                    console.warn('[Stripe Webhook] invoice.payment_failed subscription missing clerkId', {
                        subscriptionId,
                        customerId: resolveCustomerId(subscription.customer),
                    });
                    break;
                }

                const priceId = subscription.items.data[0]?.price?.id;
                const tier = priceId ? getTierForPriceId(priceId) : 'free';

                await convex.mutation(api.stripe.updateSubscription, {
                    clerkId,
                    stripeCustomerId: resolveCustomerId(subscription.customer),
                    stripeSubscriptionId: subscription.id,
                    stripePriceId: priceId ?? '',
                    subscriptionTier: tier ?? 'free',
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
