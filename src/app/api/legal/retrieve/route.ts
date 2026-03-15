/**
 * Legal Statute Search API Endpoint
 *
 * Standalone endpoint for searching legal statutes via Tavily.
 * Useful for a future "Legal Research" page or direct queries
 * outside of the chat flow.
 *
 * POST /api/legal/retrieve
 * Body: { query: string, state: string, county?: string }
 * Returns: { results: LegalSearchResult[] }
 */

import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { searchStatutes } from '@/lib/legal/search';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

const MAX_QUERY_LENGTH = 500;
const MAX_STATE_LENGTH = 50;
const MAX_COUNTY_LENGTH = 50;

/** Handle POST requests to search legal statutes via Tavily. */
export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // ── Rate limit (10/month free tier) ──
        const rl = checkRateLimit(userId, 'legal_search');
        if (!rl.allowed) {
            const { body, status } = rateLimitResponse(rl);
            return Response.json(body, { status });
        }

        const body = await req.json();
        const { query, state, county } = body as {
            query?: string;
            state?: string;
            county?: string;
        };

        if (!query || typeof query !== 'string' || query.length > MAX_QUERY_LENGTH) {
            return Response.json({ error: 'query is required and must be under 500 characters' }, { status: 400 });
        }
        if (!state || typeof state !== 'string' || state.length > MAX_STATE_LENGTH) {
            return Response.json({ error: 'state is required and must be under 50 characters' }, { status: 400 });
        }
        if (county && (typeof county !== 'string' || county.length > MAX_COUNTY_LENGTH)) {
            return Response.json({ error: 'invalid county' }, { status: 400 });
        }

        const results = await searchStatutes(state, query, county);

        return Response.json({ results });
    } catch (error) {
        console.error('Legal retrieve API error:', error);
        return Response.json(
            { error: 'Failed to search legal statutes' },
            { status: 500 }
        );
    }
}
