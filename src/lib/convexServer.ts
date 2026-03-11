/**
 * Server-side Convex client for API routes.
 *
 * API routes can't use React hooks (useQuery/useMutation), so we use
 * ConvexHttpClient for server-side queries and mutations.
 *
 * NOTE: This client is unauthenticated — it runs server-side queries
 * that validate access based on Clerk IDs passed as arguments.
 */

import { ConvexHttpClient } from 'convex/browser';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

let client: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
    if (!CONVEX_URL) {
        throw new Error('NEXT_PUBLIC_CONVEX_URL not configured');
    }
    if (!client) {
        client = new ConvexHttpClient(CONVEX_URL);
    }
    return client;
}
