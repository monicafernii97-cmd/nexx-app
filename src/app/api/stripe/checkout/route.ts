import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { stripe, getPriceIdForTier } from '@/lib/stripe';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '../../../../../convex/_generated/api';

/** Create a Stripe Checkout session for upgrading to a paid plan. */
export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { tier } = body as { tier?: string };

        if (!tier || !['pro', 'premium', 'executive'].includes(tier)) {
            return Response.json({ error: 'Invalid tier' }, { status: 400 });
        }

        const priceId = getPriceIdForTier(tier);
        if (!priceId) {
            return Response.json({ error: 'Price not configured for this tier' }, { status: 500 });
        }

        // Check if user already has a Stripe customer ID
        const convex = await getAuthenticatedConvexClient();
        const user = await convex.query(api.users.getByClerkId, { clerkId: userId });
        let customerId = user?.stripeCustomerId;

        // Create Stripe customer if they don't have one
        if (!customerId) {
            const customer = await stripe.customers.create({
                metadata: { clerkId: userId },
            });
            customerId = customer.id;
        }

        // If user already has an active subscription, create a portal session instead
        if (user?.stripeSubscriptionId) {
            const portalSession = await stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: `${req.nextUrl.origin}/subscription`,
            });
            return Response.json({ url: portalSession.url });
        }

        // Create checkout session for new subscription
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${req.nextUrl.origin}/subscription?success=true`,
            cancel_url: `${req.nextUrl.origin}/subscription?canceled=true`,
            metadata: { clerkId: userId, tier },
            subscription_data: {
                metadata: { clerkId: userId, tier },
            },
        });

        return Response.json({ url: session.url });
    } catch (error) {
        console.error('[Stripe Checkout] Error:', error);
        return Response.json({ error: 'Failed to create checkout session' }, { status: 500 });
    }
}
