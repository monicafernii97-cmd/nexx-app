/**
 * Court Rules Lookup API Route
 *
 * POST /api/court-rules/lookup
 *
 * Discovers local court formatting rules via Tavily + GPT-4o.
 * TODO: Integrate Convex courtRulesCache (30-day TTL) when ready.
 */

import { NextRequest, NextResponse } from 'next/server';
import { lookupCourtRules, CACHE_TTL_MS } from '@/lib/legal/courtRulesLookup';
import { titleCase } from '@/lib/utils/stringHelpers';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
    let body: {
        state: string;
        county: string;
        courtName?: string;
        /** TODO: Wire into cache-busting once Convex cache is integrated. */
        forceRefresh?: boolean;
    };

    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: 'Malformed JSON in request body' },
            { status: 400 }
        );
    }

    try {
        if (!body.state || !body.county) {
            return NextResponse.json(
                { error: 'state and county are required' },
                { status: 400 }
            );
        }

        const state = titleCase(body.state);
        const county = titleCase(body.county);
        const courtName = body.courtName ? titleCase(body.courtName) : undefined;

        // Look up rules via Tavily + GPT-4o (with in-memory cache)
        const result = await lookupCourtRules(state, county, courtName, body.forceRefresh);

        return NextResponse.json({
            state,
            county,
            rules: result.rules,
            sources: result.sources,
            confidence: result.confidence,
            cached: result.cached,
            cacheTTLDays: CACHE_TTL_MS / (24 * 60 * 60 * 1000),
        });
    } catch (error) {
        console.error('[Court Rules Lookup Error]', error);
        return NextResponse.json(
            { error: 'Court rules lookup failed' },
            { status: 500 }
        );
    }
}
