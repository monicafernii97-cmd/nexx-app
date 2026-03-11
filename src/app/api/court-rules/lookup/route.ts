/**
 * Court Rules Lookup API Route
 *
 * POST /api/court-rules/lookup
 *
 * Discovers local court formatting rules via Tavily + GPT-4o.
 * Requires authentication (Clerk) to protect against uncontrolled API costs.
 * Results are cached in-memory for 30 days per state/county pair.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { lookupCourtRules, CACHE_TTL_MS } from '@/lib/legal/courtRulesLookup';
import { titleCase } from '@/lib/utils/stringHelpers';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
    // ── Auth guard ──
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json(
            { error: 'Authentication required' },
            { status: 401 }
        );
    }

    let body: {
        state: string;
        county: string;
        courtName?: string;
        /** Pass true to bypass the in-memory cache and re-query AI sources. */
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

