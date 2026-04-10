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

// ── NEW: Convenience wrappers for API route usage ──

/**
 * Run a Convex query from an API route with authentication.
 * Handles client creation and auth token setup automatically.
 */
export async function convexQuery<T>(
    queryFn: FunctionReference<'query'>,
    args: Record<string, unknown>
): Promise<T> {
    const client = await getAuthenticatedConvexClient();
    return await client.query(queryFn, args) as T;
}

/**
 * Run a Convex mutation from an API route with authentication.
 * Handles client creation and auth token setup automatically.
 */
export async function convexMutation<T>(
    mutationFn: FunctionReference<'mutation'>,
    args: Record<string, unknown>
): Promise<T> {
    const client = await getAuthenticatedConvexClient();
    return await client.mutation(mutationFn, args) as T;
}

// Type import for Convex function references
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FunctionReference<T extends string> = any;

