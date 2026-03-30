import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { stripe } from '@/lib/stripe';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '@convex/_generated/api';

/** Create a Stripe Customer Portal session for self-service billing management. */
export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    try {
        const convex = await getAuthenticatedConvexClient();
        const user = await convex.query(api.users.getByClerkId, { clerkId: userId });

        if (!user?.stripeCustomerId) {
            return Response.json({ error: 'No billing account found' }, { status: 404 });
        }

        const session = await stripe.billingPortal.sessions.create({
            customer: user.stripeCustomerId,
            return_url: `${req.nextUrl.origin}/subscription`,
        });

        return Response.json({ url: session.url });
    } catch (error) {
        console.error('[Stripe Portal] Error:', error);
        return Response.json({ error: 'Failed to create portal session' }, { status: 500 });
    }
}
