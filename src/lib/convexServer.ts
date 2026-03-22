/**
 * Server-side Convex client for API routes.
 *
 * API routes can't use React hooks (useQuery/useMutation), so we use
 * ConvexHttpClient for server-side queries and mutations.
 *
 * NOTE: getConvexClient() returns a shared singleton — do NOT call
 * setAuth() on it. For authenticated queries/mutations, use
 * getAuthenticatedConvexClient() which returns a fresh per-request client.
 */

import { ConvexHttpClient } from 'convex/browser';
import { auth } from '@clerk/nextjs/server';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

let client: ConvexHttpClient | null = null;

/** Get the shared, unauthenticated Convex HTTP client singleton. */
export function getConvexClient(): ConvexHttpClient {
    if (!CONVEX_URL) {
        throw new Error('NEXT_PUBLIC_CONVEX_URL not configured');
    }
    if (!client) {
        client = new ConvexHttpClient(CONVEX_URL);
    }
    return client;
}

/**
 * Create a fresh, request-scoped Convex HTTP client with Clerk auth.
 * Avoids the race condition of calling setAuth() on the shared singleton.
 */
export async function getAuthenticatedConvexClient(): Promise<ConvexHttpClient> {
    if (!CONVEX_URL) {
        throw new Error('NEXT_PUBLIC_CONVEX_URL not configured');
    }
    const reqClient = new ConvexHttpClient(CONVEX_URL);
    const { getToken } = await auth();
    const token = await getToken({ template: 'convex' });
    if (!token) {
        throw new Error('Failed to obtain Convex auth token — user may not be authenticated');
    }
    reqClient.setAuth(token);
    return reqClient;
}
