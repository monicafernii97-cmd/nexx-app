/**
 * Court Rules Lookup — AI Discovery of Local Court Rules
 *
 * Uses Tavily to search for local/state court formatting rules,
 * then GPT-4o to extract structured CourtFormattingRules from the results.
 *
 * Flow:
 * 1. Check in-memory cache — return cached if fresh (30-day TTL)
 * 2. Search Tavily for "[state] [county] court local rules formatting filing requirements"
 * 3. Feed search results to GPT-4o with a structured extraction prompt
 * 4. Cache results in memory and return Partial<CourtFormattingRules>
 *
 * NOTE: In-memory cache is per-process. For multi-instance deployments,
 * integrate the Convex courtRulesCache table for persistent cross-instance caching.
 */

import { tavily } from '@tavily/core';
import OpenAI from 'openai';
import type { CourtFormattingRules } from './types';

/** How long cached rules remain valid (30 days in ms). */
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ── In-Memory Cache ──

interface CacheEntry {
    result: CourtRulesLookupResult;
    expiresAt: number;
}

/** Max entries to prevent unbounded memory growth */
const MAX_CACHE_SIZE = 500;

/** Process-local cache keyed by "state|county" */
const rulesCache = new Map<string, CacheEntry>();

function getCacheKey(state: string, county: string, courtName?: string): string {
    return courtName ? `${state}|${county}|${courtName}` : `${state}|${county}`;
}

function getCached(state: string, county: string, courtName?: string): CourtRulesLookupResult | null {
    const key = getCacheKey(state, county, courtName);
    const entry = rulesCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        rulesCache.delete(key);
        return null;
    }
    return { ...entry.result, cached: true };
}

function setCache(state: string, county: string, result: CourtRulesLookupResult, courtName?: string): void {
    // Evict oldest entry if cache is full (FIFO)
    if (rulesCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = rulesCache.keys().next().value;
        if (oldestKey) rulesCache.delete(oldestKey);
    }
    rulesCache.set(getCacheKey(state, county, courtName), {
        result,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });
}

// ── Tavily Search for Court Rules ──

let cachedTavilyClient: ReturnType<typeof tavily> | null = null;

function getTavilyClient() {
    if (cachedTavilyClient) return cachedTavilyClient;
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
        console.warn('[courtRulesLookup] TAVILY_API_KEY not set — court rules lookup disabled.');
        return null;
    }
    cachedTavilyClient = tavily({ apiKey });
    return cachedTavilyClient;
}

/**
 * Search Tavily for local court formatting rules and requirements.
 */
async function searchCourtRules(
    state: string,
    county: string,
    courtName?: string
): Promise<{ title: string; url: string; content: string }[]> {
    const client = getTavilyClient();
    if (!client) return [];

    try {
        const query = courtName
            ? `${courtName} ${county} County ${state} local court rules filing format requirements`
            : `${county} County ${state} district court local rules filing format page margins font requirements`;

        const response = await client.search(query, {
            maxResults: 8,
            includeDomains: ['*.gov', '*.uscourts.gov', '*.txcourts.gov'],
            searchDepth: 'advanced',
        });

        if (!response.results || response.results.length === 0) {
            // Broaden search without domain restriction
            const broadResponse = await client.search(
                `${county} County ${state} court filing format requirements margins font size`,
                { maxResults: 5, searchDepth: 'advanced' }
            );
            return (broadResponse.results ?? []).map((r) => ({
                title: r.title || 'Untitled',
                url: r.url,
                content: r.content || '',
            }));
        }

        return response.results.map((r) => ({
            title: r.title || 'Untitled',
            url: r.url,
            content: r.content || '',
        }));
    } catch (error) {
        console.error('[courtRulesLookup] Tavily search failed:', error);
        return [];
    }
}

// ── GPT-4o Rules Extraction ──

const EXTRACTION_PROMPT = `You are a legal formatting expert. Given search results about court local rules and filing requirements, extract specific document formatting rules.

Return a JSON object with ONLY the fields you can confidently determine from the sources. Do NOT guess or assume — if a rule is not mentioned, omit that field entirely.

The JSON fields you may extract (must match CourtFormattingRules type exactly):
{
  "paperWidth": <number in inches, e.g. 8.5>,
  "paperHeight": <number in inches, e.g. 11>,
  "marginTop": <number in inches>,
  "marginBottom": <number in inches>,
  "marginLeft": <number in inches>,
  "marginRight": <number in inches>,
  "fontFamily": <string, e.g. "Times New Roman">,
  "fontSize": <number in points, e.g. 14>,
  "lineSpacing": <number, e.g. 2.0 for double-spaced, 1.5 for one-and-a-half>,
  "pageNumbering": <boolean>,
  "pageNumberFormat": <"simple" | "x-of-y">,
  "pageNumberPosition": <"bottom-center" | "bottom-right" | "footer-split">,
  "captionStyle": <"section-symbol" | "versus" | "centered">,
  "requiresSignatureBlock": <boolean>,
  "requiresCertificateOfService": <boolean>,
  "requiresVerification": <boolean>,
  "notes": [<array of string notes about specific requirements>]
}

Respond with ONLY valid JSON, no markdown fences or explanation.`;

interface ExtractionResult {
    rules: Partial<CourtFormattingRules>;
    sources: string[];
    confidence: number;
}

/**
 * Use GPT-4o to extract structured formatting rules from search results.
 */
async function extractRulesWithAI(
    searchResults: { title: string; url: string; content: string }[],
    state: string,
    county: string
): Promise<ExtractionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.warn('[courtRulesLookup] OPENAI_API_KEY not set — returning empty rules.');
        return { rules: {}, sources: [], confidence: 0 };
    }

    const openai = new OpenAI({ apiKey });

    // Build context from search results
    const contextChunks = searchResults.map(
        (r, i) => `[Source ${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 1500)}`
    );

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: EXTRACTION_PROMPT },
                {
                    role: 'user',
                    content: `Extract court formatting rules for ${county} County, ${state} from these search results:\n\n${contextChunks.join('\n\n---\n\n')}`,
                },
            ],
        });

        const content = response.choices[0]?.message?.content;
        if (!content) return { rules: {}, sources: [], confidence: 0 };

        let parsed: Partial<CourtFormattingRules>;
        try {
            parsed = JSON.parse(content) as Partial<CourtFormattingRules>;
        } catch (parseError) {
            console.warn('[courtRulesLookup] Failed to parse GPT response:', content.slice(0, 200), parseError);
            return { rules: {}, sources: [], confidence: 0 };
        }

        // Calculate confidence based on how many fields were extracted
        const fieldCount = Object.keys(parsed).length;
        const maxFields = 17; // Must match extractable fields in EXTRACTION_PROMPT
        const confidence = Math.min(fieldCount / maxFields, 1.0);

        return {
            rules: parsed,
            sources: searchResults.map((r) => r.url),
            confidence,
        };
    } catch (error) {
        console.error('[courtRulesLookup] GPT-4o extraction failed:', error);
        return { rules: {}, sources: [], confidence: 0 };
    }
}

// ── Public API ──

export interface CourtRulesLookupResult {
    rules: Partial<CourtFormattingRules>;
    sources: string[];
    confidence: number;
    cached: boolean;
}

/**
 * Look up local court formatting rules for a given state/county.
 *
 * Results are cached in-memory for 30 days per state/county pair.
 * Use `forceRefresh` to bypass the cache and re-query AI sources.
 *
 * @param state - US state name (e.g. "Texas")
 * @param county - County name (e.g. "Fort Bend")
 * @param courtName - Optional specific court name
 * @param forceRefresh - Skip the cache and re-query
 * @returns Partial formatting rules discovered from official sources
 */
export async function lookupCourtRules(
    state: string,
    county: string,
    courtName?: string,
    forceRefresh = false
): Promise<CourtRulesLookupResult> {
    // Step 1: Check cache (unless force-refreshing)
    if (!forceRefresh) {
        const cached = getCached(state, county, courtName);
        if (cached) return cached;
    }

    // Step 2: Search Tavily
    const searchResults = await searchCourtRules(state, county, courtName);

    if (searchResults.length === 0) {
        return {
            rules: {},
            sources: [],
            confidence: 0,
            cached: false,
        };
    }

    // Step 3: Extract rules with GPT-4o
    const extraction = await extractRulesWithAI(searchResults, state, county);

    const result: CourtRulesLookupResult = {
        ...extraction,
        cached: false,
    };

    // Step 4: Cache for future requests
    if (extraction.confidence > 0) {
        setCache(state, county, result, courtName);
    }

    return result;
}
