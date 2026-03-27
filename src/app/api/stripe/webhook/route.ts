import { NextRequest } from 'next/server';
import { stripe, getTierForPriceId } from '@/lib/stripe';
import { getConvexClient } from '@/lib/convexServer';
import { api } from '../../../../../convex/_generated/api';
import type Stripe from 'stripe';

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

                if (clerkId && tier && session.subscription) {
                    const subscriptionId = typeof session.subscription === 'string'
                        ? session.subscription
                        : session.subscription.id;

                    await convex.mutation(api.stripe.updateSubscription, {
                        clerkId,
                        stripeCustomerId: session.customer as string,
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

                if (clerkId) {
                    const status = subscription.status === 'active' || subscription.status === 'trialing'
                        ? 'active'
                        : subscription.status === 'past_due'
                            ? 'past_due'
                            : subscription.status === 'canceled'
                                ? 'canceled'
                                : 'active';

                    await convex.mutation(api.stripe.updateSubscription, {
                        clerkId,
                        stripeCustomerId: typeof subscription.customer === 'string'
                            ? subscription.customer
                            : subscription.customer.id,
                        stripeSubscriptionId: subscription.id,
                        stripePriceId: priceId ?? '',
                        subscriptionTier: tier ?? 'free',
                        subscriptionStatus: status,
                    });
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription;
                const clerkId = subscription.metadata?.clerkId;

                if (clerkId) {
                    await convex.mutation(api.stripe.updateSubscription, {
                        clerkId,
                        stripeCustomerId: typeof subscription.customer === 'string'
                            ? subscription.customer
                            : subscription.customer.id,
                        stripeSubscriptionId: '',
                        stripePriceId: '',
                        subscriptionTier: 'free',
                        subscriptionStatus: 'canceled',
                    });
                }
                break;
            }

            case 'invoice.payment_failed': {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const invoice = event.data.object as any;
                const subscriptionId = typeof invoice.subscription === 'string'
                    ? invoice.subscription
                    : invoice.subscription?.id;

                if (subscriptionId) {
                    // Fetch subscription to get clerkId from metadata
                    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                    const clerkId = subscription.metadata?.clerkId;

                    if (clerkId) {
                        const priceId = subscription.items.data[0]?.price?.id;
                        const tier = priceId ? getTierForPriceId(priceId) : 'free';

                        await convex.mutation(api.stripe.updateSubscription, {
                            clerkId,
                            stripeCustomerId: typeof subscription.customer === 'string'
                                ? subscription.customer
                                : subscription.customer.id,
                            stripeSubscriptionId: subscription.id,
                            stripePriceId: priceId ?? '',
                            subscriptionTier: tier ?? 'free',
                            subscriptionStatus: 'past_due',
                        });
                    }
                }
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
