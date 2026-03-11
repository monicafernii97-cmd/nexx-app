/**
 * Court Rules Lookup API Route
 *
 * POST /api/court-rules/lookup
 *
 * Discovers local court formatting rules via Tavily + GPT-4o.
 * Checks Convex cache first (30-day TTL) before querying AI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { lookupCourtRules, CACHE_TTL_MS } from '@/lib/legal/courtRulesLookup';

export const maxDuration = 30;

/**
 * Title-case a string for consistent lookups.
 */
function titleCase(s: string): string {
    return s
        .trim()
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

export async function POST(request: NextRequest) {
    let body: {
        state: string;
        county: string;
        courtName?: string;
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

        // Look up rules via Tavily + GPT-4o
        const result = await lookupCourtRules(state, county, body.courtName);

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
