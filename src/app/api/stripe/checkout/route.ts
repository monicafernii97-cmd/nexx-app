import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { stripe, getPriceIdForTier } from '@/lib/stripe';
import { isPaidTier } from '@/lib/tiers';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '../../../../../convex/_generated/api';

/** Create a Stripe Checkout session for upgrading to a paid plan. */
export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    // ── Parse & validate request body ──
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: 'Malformed request body' }, { status: 400 });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return Response.json({ error: 'Request body must be a JSON object' }, { status: 400 });
    }

    const { tier } = body as { tier?: string };
    if (!tier || typeof tier !== 'string' || !isPaidTier(tier)) {
        return Response.json({ error: 'Invalid tier — must be pro, premium, or executive' }, { status: 400 });
    }

    const priceId = getPriceIdForTier(tier);
    if (!priceId) {
        return Response.json({ error: 'Price not configured for this tier' }, { status: 500 });
    }

    try {
        // ── Fetch user record from Convex ──
        const convex = await getAuthenticatedConvexClient();
        const user = await convex.query(api.users.getByClerkId, { clerkId: userId });

        if (!user) {
            return Response.json({ error: 'User record not found — please complete onboarding first' }, { status: 404 });
        }

        // ── Reject billing mismatch: subscriptionId exists but no customerId ──
        // This prevents creating a fresh Stripe customer when one should already exist.
        if (user.stripeSubscriptionId && !user.stripeCustomerId) {
            console.error('[Stripe Checkout] User has subscriptionId but no customerId', { userId });
            return Response.json({ error: 'Billing account mismatch — contact support' }, { status: 400 });
        }

        let customerId = user.stripeCustomerId;

        // ── Create Stripe customer if needed & persist immediately ──
        if (!customerId) {
            const customer = await stripe.customers.create({
                metadata: { clerkId: userId },
            }, {
                idempotencyKey: `stripe-customer:${userId}`,
            });
            customerId = customer.id;

            // Persist the new customer ID right away to prevent duplicate creation
            const serverSecret = process.env.STRIPE_WEBHOOK_SECRET;
            if (!serverSecret) {
                // Best-effort cleanup — don't let deletion failure mask the config error
                try {
                    await stripe.customers.del(customerId);
                } catch (delError) {
                    console.error('[Stripe Checkout] Failed to clean up orphaned customer', { customerId, error: delError });
                }
                console.error('[Stripe Checkout] STRIPE_WEBHOOK_SECRET not configured');
                return Response.json({ error: 'Server configuration error' }, { status: 500 });
            }

            try {
                await convex.mutation(api.stripe.updateSubscription, {
                    serverSecret,
                    clerkId: userId,
                    stripeCustomerId: customerId,
                    stripeSubscriptionId: '',
                    stripePriceId: '',
                    subscriptionTier: user.subscriptionTier ?? 'free',
                    subscriptionStatus: user.subscriptionStatus ?? 'active',
                });
            } catch (persistError) {
                // Mutation failed — best-effort cleanup of the orphaned Stripe customer
                console.error('[Stripe Checkout] Failed to persist customer ID', { userId, customerId, error: persistError });
                try {
                    await stripe.customers.del(customerId);
                } catch (delError) {
                    console.error('[Stripe Checkout] Failed to clean up orphaned customer during rollback', { customerId, error: delError });
                }
                return Response.json({ error: 'Failed to save billing record — please try again' }, { status: 500 });
            }
        }

        // ── If user already has an active subscription, open the portal for plan changes ──
        if (user.stripeSubscriptionId) {
            const portalSession = await stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: `${req.nextUrl.origin}/subscription`,
                flow_data: {
                    type: 'subscription_update',
                    subscription_update: {
                        subscription: user.stripeSubscriptionId,
                    },
                },
            });
            return Response.json({ url: portalSession.url });
        }

        // ── Create checkout session for new subscription ──
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${req.nextUrl.origin}/dashboard?checkout=success`,
            cancel_url: `${req.nextUrl.origin}/subscription?canceled=true`,
            metadata: { clerkId: userId, tier },
            subscription_data: {
                metadata: { clerkId: userId, tier },
            },
        }, {
            idempotencyKey: `stripe-checkout:${userId}:${tier}`,
        });

        if (!session.url) {
            console.error('[Stripe Checkout] Session created without URL', { sessionId: session.id });
            return Response.json({ error: 'Failed to create checkout session' }, { status: 500 });
        }

        return Response.json({ url: session.url });
    } catch (error) {
        console.error('[Stripe Checkout] Error:', error);
        return Response.json({ error: 'Failed to create checkout session' }, { status: 500 });
    }
}
