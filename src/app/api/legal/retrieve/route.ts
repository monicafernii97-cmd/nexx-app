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
import { searchStatutes } from '@/lib/legal/search';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { query, state, county } = body as {
            query?: string;
            state?: string;
            county?: string;
        };

        if (!query || typeof query !== 'string') {
            return Response.json({ error: 'query is required' }, { status: 400 });
        }
        if (!state || typeof state !== 'string') {
            return Response.json({ error: 'state is required' }, { status: 400 });
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
