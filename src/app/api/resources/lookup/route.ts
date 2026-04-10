/**
 * Resource Lookup API Route — Dynamic Resource Hub
 *
 * Calls OpenAI (GPT-4o-mini, JSON mode) to discover local government
 * and legal resources for a given state + county, then caches the results
 * in the Convex `resourcesCache` table.
 *
 * POST /api/resources/lookup
 * Body: { state: string, county: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOpenAI } from '@/lib/openai';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '@convex/_generated/api';
import { titleCase } from '@/lib/utils/stringHelpers';

/** Maximum state/county string length to prevent abuse. */
const MAX_INPUT_LEN = 100;

/**
 * Module-scoped map for coalescing concurrent lookups.
 * Key: `state::county`, Value: in-flight Promise.
 * Prevents duplicate OpenAI calls when multiple requests hit the same cache miss.
 */
const pendingLookups = new Map<string, Promise<{ resources: Record<string, unknown>; sources: string[] }>>();

/**
 * Known eFiling vendor domains.
 * URLs whose host doesn't match any of these are treated as unverified
 * and suppressed to avoid sending users to hallucinated or attacker-controlled sites.
 */
const TRUSTED_EFILING_HOSTS = [
    'efiletexas.gov', 'www.efiletexas.gov',
    'odysseyfileandserve.com', 'www.odysseyfileandserve.com',
    'fileandservexpress.com', 'www.fileandservexpress.com',
    'turbocourt.com', 'www.turbocourt.com',
    'mycase.com', 'www.mycase.com',
    'odysseyefileca.tylerhost.net', 'efiling.courts.ca.gov',
    'efile.txcourts.gov', 'www.efile.txcourts.gov',
    'efileil.com', 'www.efileil.com',
    'efilingportal.com', 'www.efilingportal.com',
    'ifile.flclerks.com', 'www.ifile.flclerks.com',
    'myflcourtaccess.com', 'www.myflcourtaccess.com',
];

/**
 * Lightweight URL health check — returns true if the URL responds with a 2xx or 3xx.
 * Falls back to false on any network error or 4xx/5xx status.
 */
async function validateUrl(url: string): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5_000);
        const res = await fetch(url, {
            method: 'HEAD',
            redirect: 'follow',
            signal: controller.signal,
            headers: { 'User-Agent': 'NEXX-UrlValidator/1.0' },
        });
        clearTimeout(timeout);
        return res.ok || (res.status >= 300 && res.status < 400);
    } catch {
        return false;
    }
}

/**
 * Build a Google search fallback URL for a resource.
 * Used when the AI-generated URL fails validation.
 */
function googleFallback(county: string, state: string, resourceType: string): string {
    const q = encodeURIComponent(`${county} County ${state} ${resourceType} official site`);
    return `https://www.google.com/search?q=${q}`;
}

/**
 * Validate all URLs in the resources object.
 * Invalid URLs (404, network error, timeout) are replaced with a Google search fallback.
 * Runs validations in parallel for speed.
 */
async function validateResourceUrls(
    resources: Record<string, unknown>,
    county: string,
    state: string,
): Promise<Record<string, unknown>> {
    const result = { ...resources };

    const singleKeys: { key: string; fallbackLabel: string }[] = [
        { key: 'courtClerk', fallbackLabel: 'county clerk' },
        { key: 'courtsWebsite', fallbackLabel: 'district courts' },
        { key: 'familyDivision', fallbackLabel: 'family court' },
        { key: 'localRules', fallbackLabel: 'local court rules' },
        { key: 'stateFamilyCode', fallbackLabel: 'family law code' },
        { key: 'caseSearch', fallbackLabel: 'case search records' },
        { key: 'eFilingPortal', fallbackLabel: 'eFiling portal' },
    ];

    // Build list of validation tasks
    const tasks: { apply: (valid: boolean) => void; url: string }[] = [];

    for (const { key, fallbackLabel } of singleKeys) {
        const entry = result[key];
        if (entry && typeof entry === 'object' && 'url' in (entry as Record<string, unknown>)) {
            const obj = entry as Record<string, unknown>;
            const url = obj.url;
            if (typeof url === 'string' && url.startsWith('http')) {
                tasks.push({
                    url,
                    apply: (valid) => {
                        if (!valid) {
                            console.warn(`[Resource Lookup] URL failed validation for ${key}: ${url}`);
                            (obj as Record<string, unknown>).url = googleFallback(county, state, fallbackLabel);
                        }
                    },
                });
            }
        }
    }

    // Also validate arrays (legalAid, nonprofits)
    for (const arrayKey of ['legalAid', 'nonprofits']) {
        const arr = result[arrayKey];
        if (Array.isArray(arr)) {
            for (const item of arr) {
                if (typeof item === 'object' && item && 'url' in item) {
                    const url = (item as Record<string, unknown>).url;
                    if (typeof url === 'string' && url.startsWith('http')) {
                        tasks.push({
                            url,
                            apply: (valid) => {
                                if (!valid) {
                                    console.warn(`[Resource Lookup] URL failed validation in ${arrayKey}: ${url}`);
                                    (item as Record<string, unknown>).url = undefined;
                                }
                            },
                        });
                    }
                }
            }
        }
    }

    // Run all validations in parallel
    if (tasks.length > 0) {
        const results = await Promise.all(tasks.map(t => validateUrl(t.url)));
        results.forEach((valid, i) => tasks[i].apply(valid));
        const failedCount = results.filter(v => !v).length;
        if (failedCount > 0) {
            console.warn(`[Resource Lookup] ${failedCount}/${tasks.length} URLs failed validation — replaced with fallbacks`);
        }
    }

    return result;
}

export async function POST(req: NextRequest) {
    // ── Auth ──
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // ── Parse body ──
    let state: string;
    let county: string;
    try {
        const body = await req.json();
        state = typeof body.state === 'string' ? body.state.trim() : '';
        county = typeof body.county === 'string' ? body.county.trim() : '';
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

        let response;
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            response = await (openai.responses as any).create({
                model: 'gpt-4o',
                temperature: 0.2,
                input: [
                    {
                        role: 'developer',
                        content: `You are a US legal resources researcher.\n\nCRITICAL RULES:\n- ONLY return URLs you are CERTAIN exist and are currently active. Do NOT guess, construct, or fabricate URLs.\n- If you are not confident a specific URL exists, set the "url" field to null — do NOT invent a plausible-looking URL.\n- Prefer official government websites (.gov, .us) over third-party sites.\n- Include real phone numbers and addresses when available.\n- For "sources", list 2-4 URLs you actually referenced.\n- If a resource doesn't exist for this location, set that entire field to null.\n- For arrays (legalAid, nonprofits), include 1-3 entries each, only with verified information.\n- All URLs must be complete (https://...).\n- Descriptions should be 1-2 sentences max.\n- When unsure about a URL, it is ALWAYS better to return null than to return a wrong URL that could lead to a 404 page.`,
                    },
                    {
                        role: 'user',
                        content: buildUserPrompt(normCounty, normState),
                    },
                ],
                text: {
                    format: {
                        type: 'json_schema',
                        name: 'resources_lookup_full',
                        strict: true,
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                courtClerk: { type: ['object', 'null'] },
                                courtsWebsite: { type: ['object', 'null'] },
                                familyDivision: { type: ['object', 'null'] },
                                localRules: { type: ['object', 'null'] },
                                stateFamilyCode: { type: ['object', 'null'] },
                                legalAid: { type: 'array', items: { type: 'object' } },
                                nonprofits: { type: 'array', items: { type: 'object' } },
                                caseSearch: { type: ['object', 'null'] },
                                eFilingPortal: { type: ['object', 'null'] },
                                sources: { type: 'array', items: { type: 'string' } },
                            },
                            required: ['courtClerk', 'courtsWebsite', 'familyDivision', 'localRules',
                                       'stateFamilyCode', 'legalAid', 'nonprofits', 'caseSearch',
                                       'eFilingPortal', 'sources'],
                        },
                    },
                },
            }, { signal: abortCtrl.signal });
        } finally {
            clearTimeout(timeoutId);
        }

        const raw = response.output_text;
        if (!raw) throw new Error('AI returned empty response');

        const parsed = JSON.parse(raw) as Record<string, unknown>;

        // Extract sources array
        const rawSources = parsed.sources;
        const sources = Array.isArray(rawSources)
            ? (rawSources as unknown[])
                .filter((s): s is string => typeof s === 'string')
                .map((s) => safeUrl(s))
                .filter((s): s is string => Boolean(s))
            : [];

        // Deep-scan all URL fields for safety (schema guarantees structure, but URLs need runtime validation)
        const resources = { ...parsed } as Record<string, unknown>;
        delete resources.sources;

        // Verify eFiling portal against trusted hosts
        if (resources.eFilingPortal && typeof resources.eFilingPortal === 'object') {
            const portal = resources.eFilingPortal as Record<string, unknown>;
            if (typeof portal.url === 'string') {
                try {
                    const host = new URL(portal.url).hostname.toLowerCase();
                    if (!TRUSTED_EFILING_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
                        console.warn(`[Resource Lookup] eFiling portal URL host "${host}" is not on the trusted vendor list — suppressing`);
                        portal.url = undefined;
                    }
                } catch {
                    portal.url = undefined;
                }
            }
        }

        // ── Validate URLs before caching ──
        const validatedResources = await validateResourceUrls(resources, normCounty, normState);

        // ── Store in Convex (via public action wrapper) ──
        await convex.action(api.resourcesCache.upsertFromServer, {
            state: normState,
            county: normCounty,
            resources: validatedResources,
            sources,
        });

        return { resources: validatedResources, sources };
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

/** Build the user message for the OpenAI prompt. */
function buildUserPrompt(
    county: string,
    state: string,
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
    prompt += `9. eFiling portal — the official electronic filing system for this county (e.g., eFileTexas.gov, TurboCourt, File & ServeXpress, Odyssey, etc.). Include the provider/vendor name.\n`;
    prompt += `\nReturn as structured JSON.`;
    return prompt;
}

// ── URL safety ──

/** Validate URL is http(s) only — defense-in-depth against malicious AI URLs. */
function safeUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : undefined;
    } catch {
        return undefined;
    }
}
