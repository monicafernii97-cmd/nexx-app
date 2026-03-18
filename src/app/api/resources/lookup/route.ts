/**
 * Resource Lookup API Route — Dynamic Resource Hub
 *
 * Calls OpenAI (GPT-4o-mini, JSON mode) to discover local government
 * and legal resources for a given state + county, then caches the results
 * in the Convex `resourcesCache` table.
 *
 * POST /api/resources/lookup
 * Body: { state: string, county: string, courtName?: string, causeNumber?: string, hasOpenCase?: boolean }
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOpenAI } from '@/lib/openai';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '../../../../../convex/_generated/api';
import { titleCase } from '@/lib/utils/stringHelpers';

/** Maximum state/county string length to prevent abuse. */
const MAX_INPUT_LEN = 100;

/**
 * Module-scoped map for coalescing concurrent lookups.
 * Key: `state::county`, Value: in-flight Promise.
 * Prevents duplicate OpenAI calls when multiple requests hit the same cache miss.
 */
const pendingLookups = new Map<string, Promise<{ resources: Record<string, unknown>; sources: string[] }>>();

const RESOURCE_JSON_SCHEMA = `{
  "courtClerk": { "name": string, "description": string, "url": string, "phone": string, "address": string } | null,
  "courtsWebsite": { "name": string, "description": string, "url": string } | null,
  "familyDivision": { "name": string, "description": string, "url": string, "address": string } | null,
  "localRules": { "name": string, "description": string, "url": string } | null,
  "stateFamilyCode": { "name": string, "description": string, "url": string } | null,
  "legalAid": [{ "name": string, "description": string, "url": string, "phone": string }],
  "nonprofits": [{ "name": string, "description": string, "url": string, "phone": string }],
  "caseSearch": { "name": string, "description": string, "url": string } | null,
  "sources": [string]
}`;

export async function POST(req: NextRequest) {
    // ── Auth ──
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // ── Parse body ──
    let state: string;
    let county: string;
    let courtName: string | undefined;
    let causeNumber: string | undefined;
    let hasOpenCase = false;
    try {
        const body = await req.json();
        state = typeof body.state === 'string' ? body.state.trim() : '';
        county = typeof body.county === 'string' ? body.county.trim() : '';
        courtName = typeof body.courtName === 'string' && body.courtName.trim() ? body.courtName.trim() : undefined;
        causeNumber = typeof body.causeNumber === 'string' && body.causeNumber.trim() ? body.causeNumber.trim() : undefined;
        hasOpenCase = body.hasOpenCase === true;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!state || !county) {
        return NextResponse.json({ error: 'state and county are required' }, { status: 400 });
    }
    if (state.length > MAX_INPUT_LEN || county.length > MAX_INPUT_LEN) {
        return NextResponse.json({ error: 'Input too long' }, { status: 400 });
    }

    // Normalize casing
    const normState = titleCase(state);
    const normCounty = titleCase(county.replace(/\s+County$/i, ''));

    // ── Check existing cache (before rate limit so cache hits are free) ──
    const convex = await getAuthenticatedConvexClient();
    const existing = await convex.query(api.resourcesCache.get, {
        state: normState,
        county: normCounty,
    });
    if (existing) {
        return NextResponse.json({
            status: 'cached',
            resources: existing.resources,
            sources: existing.sources,
        });
    }

    // ── Coalesce concurrent lookups (before rate limit so waiters are free) ──
    const lookupKey = `${normState}::${normCounty}`;
    if (pendingLookups.has(lookupKey)) {
        try {
            const result = await pendingLookups.get(lookupKey)!;
            return NextResponse.json({ status: 'ok', ...result });
        } catch {
            return NextResponse.json({ error: 'Resource lookup failed. Please try again.' }, { status: 500 });
        }
    }

    // ── Rate limit (only consumed when AI lookup is actually needed) ──
    const rl = checkRateLimit(userId, 'resource_lookup');
    if (!rl.allowed) {
        const { body, status } = rateLimitResponse(rl);
        return NextResponse.json(body, { status });
    }

    // ── OpenAI Lookup (with coalescing) ──
    const lookupPromise = (async () => {
        const openai = getOpenAI();
        const abortCtrl = new AbortController();
        const timeoutId = setTimeout(() => abortCtrl.abort(), 30_000);

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            temperature: 0.2,
            messages: [
                {
                    role: 'system',
                    content: `You are a US legal resources researcher. Return ONLY valid JSON matching this schema:\n${RESOURCE_JSON_SCHEMA}\n\nRules:\n- Use official government websites (.gov, .us) when possible.\n- Include real phone numbers and addresses when available.\n- For "sources", list 2-4 URLs you referenced.\n- If a resource doesn't exist for this location, set it to null.\n- For arrays (legalAid, nonprofits), include 1-3 entries each.\n- All URLs must be complete (https://...).\n- Descriptions should be 1-2 sentences max.`,
                },
                {
                    role: 'user',
                    content: buildUserPrompt(normCounty, normState, courtName, causeNumber, hasOpenCase),
                },
            ],
        }, { signal: abortCtrl.signal });

        clearTimeout(timeoutId);

        const raw = completion.choices[0]?.message?.content;
        if (!raw) throw new Error('AI returned empty response');

        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(raw);
        } catch {
            throw new Error('AI returned invalid JSON');
        }

        // Extract sources array before storing resources
        const rawSources = parsed.sources;
        const sources = Array.isArray(rawSources)
            ? (rawSources as unknown[]).filter((s): s is string => typeof s === 'string')
            : [];
        if (Array.isArray(rawSources) && sources.length < rawSources.length) {
            console.warn('[Resource Lookup] Dropped malformed source entries:', rawSources.filter(s => typeof s !== 'string'));
        }

        // Build a clean resources object matching the Convex schema
        const resources = {
            courtClerk: parsed.courtClerk && typeof parsed.courtClerk === 'object'
                ? sanitizeResource(parsed.courtClerk as Record<string, unknown>, true) : undefined,
            courtsWebsite: parsed.courtsWebsite && typeof parsed.courtsWebsite === 'object'
                ? sanitizeResourceNoAddr(parsed.courtsWebsite as Record<string, unknown>) : undefined,
            familyDivision: parsed.familyDivision && typeof parsed.familyDivision === 'object'
                ? sanitizeFamilyDivision(parsed.familyDivision as Record<string, unknown>) : undefined,
            localRules: parsed.localRules && typeof parsed.localRules === 'object'
                ? sanitizeResourceNoAddr(parsed.localRules as Record<string, unknown>) : undefined,
            stateFamilyCode: parsed.stateFamilyCode && typeof parsed.stateFamilyCode === 'object'
                ? sanitizeResourceNoAddr(parsed.stateFamilyCode as Record<string, unknown>) : undefined,
            legalAid: sanitizeArray(parsed.legalAid),
            nonprofits: sanitizeArray(parsed.nonprofits),
            caseSearch: parsed.caseSearch && typeof parsed.caseSearch === 'object'
                ? sanitizeResourceNoAddr(parsed.caseSearch as Record<string, unknown>) : undefined,
        };

        // ── Store in Convex (via public action wrapper) ──
        await convex.action(api.resourcesCache.upsertFromServer, {
            state: normState,
            county: normCounty,
            resources,
            sources,
        });

        return { resources, sources };
    })();

    pendingLookups.set(lookupKey, lookupPromise);

    try {
        const result = await lookupPromise;
        return NextResponse.json({ status: 'ok', ...result });
    } catch (err) {
        console.error('[Resource Lookup] OpenAI error:', err);
        return NextResponse.json(
            { error: 'Resource lookup failed. Please try again.' },
            { status: 500 },
        );
    } finally {
        pendingLookups.delete(lookupKey);
    }
}

// ── Prompt builder ──

/** Build the user message for the OpenAI prompt, optionally enriched with court-specific context. */
function buildUserPrompt(
    county: string,
    state: string,
    courtName?: string,
    causeNumber?: string,
    hasOpenCase?: boolean,
): string {
    let prompt = `Find the official government and legal resources for ${county} County, ${state}:\n\n`;
    prompt += `1. County Clerk office — name, website, phone, address\n`;
    prompt += `2. County district courts website\n`;
    prompt += `3. Family court / family law division — name, website, address\n`;
    prompt += `4. Local rules & procedures URL\n`;
    prompt += `5. State family law code URL\n`;
    prompt += `6. Local legal aid organizations (name, website, phone)\n`;
    prompt += `7. Local DV shelters / nonprofits (name, website, phone)\n`;
    prompt += `8. Public case search / records portal — the website where anyone can look up a case by cause number or party name\n`;

    if (hasOpenCase) {
        prompt += `\nIMPORTANT: The user has an active court case in this county.`;
        if (courtName) {
            prompt += ` Their case is in the ${courtName}.`;
        }
        if (causeNumber) {
            prompt += ` Cause number: ${causeNumber}.`;
        }
        prompt += `\nFor the courtsWebsite and familyDivision fields, prioritize finding:\n`;
        prompt += `- The SPECIFIC court page or division page for ${courtName || 'their assigned court'}\n`;
        prompt += `- The county's online case search / public records portal (where they can look up their case)\n`;
        prompt += `- The clerk's e-filing portal if one exists\n`;
    }

    prompt += `\nReturn as structured JSON.`;
    return prompt;
}

// ── Sanitization helpers ──

/** Extract string fields from an AI response object, filtering out non-strings. */
function str(obj: Record<string, unknown>, key: string): string | undefined {
    const val = obj[key];
    return typeof val === 'string' && val.trim() ? val.trim() : undefined;
}

/** Sanitize a full resource entry (with address). */
function sanitizeResource(obj: Record<string, unknown>, includeAddress: boolean) {
    const name = str(obj, 'name');
    if (!name) return undefined;
    return {
        name,
        description: str(obj, 'description'),
        url: str(obj, 'url'),
        phone: str(obj, 'phone'),
        ...(includeAddress ? { address: str(obj, 'address') } : {}),
    };
}

/** Sanitize a resource entry without address. */
function sanitizeResourceNoAddr(obj: Record<string, unknown>) {
    const name = str(obj, 'name');
    if (!name) return undefined;
    return {
        name,
        description: str(obj, 'description'),
        url: str(obj, 'url'),
    };
}

/** Sanitize a family division entry (with address but no phone). */
function sanitizeFamilyDivision(obj: Record<string, unknown>) {
    const name = str(obj, 'name');
    if (!name) return undefined;
    return {
        name,
        description: str(obj, 'description'),
        url: str(obj, 'url'),
        address: str(obj, 'address'),
    };
}

/** Sanitize an array of resource entries from the AI response. */
function sanitizeArray(raw: unknown): { name: string; description?: string; url?: string; phone?: string }[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const result = raw
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .map((item) => {
            const name = str(item, 'name');
            if (!name) return null;
            return {
                name,
                description: str(item, 'description'),
                url: str(item, 'url'),
                phone: str(item, 'phone'),
            };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
    return result.length > 0 ? result : undefined;
}
