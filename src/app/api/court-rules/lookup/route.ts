/**
 * Court Rules Lookup API Route
 *
 * POST /api/court-rules/lookup
 *
 * Discovers local court formatting rules via GPT-4o (using model knowledge + optional cached localRulesUrl).
 * Requires authentication (Clerk) to protect against uncontrolled API costs.
 * Results are cached in-memory for 30 days per state/county pair.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { lookupCourtRules, CACHE_TTL_MS } from '@/lib/legal/courtRulesLookup';
import { titleCase } from '@/lib/utils/stringHelpers';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';

export const maxDuration = 30;

/** Handle POST requests for court rules lookup — authenticates, rate-limits, and queries AI sources. */
export async function POST(request: NextRequest) {
    // ── Auth guard ──
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json(
            { error: 'Authentication required' },
            { status: 401 }
        );
    }

    // ── Rate limit (3/month free tier) ──
    const rl = checkRateLimit(userId, 'court_rules_lookup');
    if (!rl.allowed) {
        const { body, status } = rateLimitResponse(rl);
        return NextResponse.json(body, { status });
    }

    let body: Record<string, unknown>;

    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: 'Malformed JSON in request body' },
            { status: 400 }
        );
    }

    // ── Type validation ──
    const { state, county, courtName, settingsId, forceRefresh } = body;

    if (typeof state !== 'string' || typeof county !== 'string') {
        return NextResponse.json(
            { error: 'state and county must be non-empty strings' },
            { status: 400 }
        );
    }
    if (!state || !county) {
        return NextResponse.json(
            { error: 'state and county are required' },
            { status: 400 }
        );
    }
    if (courtName !== undefined && typeof courtName !== 'string') {
        return NextResponse.json(
            { error: 'courtName must be a string' },
            { status: 400 }
        );
    }
    if (settingsId !== undefined && typeof settingsId !== 'string') {
        return NextResponse.json(
            { error: 'settingsId must be a string' },
            { status: 400 }
        );
    }
    if (forceRefresh !== undefined && typeof forceRefresh !== 'boolean') {
        return NextResponse.json(
            { error: 'forceRefresh must be a boolean' },
            { status: 400 }
        );
    }

    try {
        const normalizedState = titleCase(state);
        const normalizedCounty = titleCase(county);
        const normalizedCourtName = courtName ? titleCase(courtName) : undefined;

        // Create a single authenticated Convex client for reuse
        const convex = await getAuthenticatedConvexClient();

        // Fetch cached resources to get the localRules URL (if available)
        // This bridges the Resources page data with the court rules verification.
        let localRulesUrl: string | undefined;
        try {
            const cached = await convex.query(api.resourcesCache.get, {
                state: normalizedState,
                county: normalizedCounty,
            });
            const resources = cached?.resources as Record<string, unknown> | undefined;
            if (resources?.localRules && typeof resources.localRules === 'object') {
                const lr = resources.localRules as Record<string, unknown>;
                if (typeof lr.url === 'string') {
                    localRulesUrl = lr.url;
                }
            }
        } catch (cacheErr) {
            console.warn('[Court Rules Lookup] Failed to fetch cached resources (non-blocking):', cacheErr);
        }

        // Look up rules via GPT-4o (with in-memory cache)
        const result = await lookupCourtRules({
            state: normalizedState,
            county: normalizedCounty,
            courtName: normalizedCourtName,
            forceRefresh: forceRefresh === true,
            localRulesUrl,
        });

        // If settingsId provided and verification yielded results,
        // mark settings as NEXXverified via server-secret-gated action.
        if (settingsId && result.rules && Object.keys(result.rules).length > 0) {
            try {
                // Reuse the existing Convex client (already authenticated above)
                await convex.action(
                    api.courtSettings.applyNEXXverification,
                    {
                        id: settingsId as Id<'userCourtSettings'>,
                        formattingOverrides: result.rules,
                        serverSecret: process.env.VERIFICATION_SECRET ?? '',
                    }
                );
            } catch (markErr) {
                console.warn('[Court Rules Lookup] Failed to mark NEXXverified:', markErr);
                // Continue — lookup result is still returned
            }
        }

        return NextResponse.json({
            state: normalizedState,
            county: normalizedCounty,
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
