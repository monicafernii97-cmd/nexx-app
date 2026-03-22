/**
 * Court Rules Lookup — AI Discovery of Local Court Rules
 *
 * Uses GPT-4o to discover and extract local court formatting rules
 * for a given state + county. When available, enriches the prompt
 * with cached Resources Hub data (e.g. localRules URLs) so the model
 * can reference real jurisdiction-specific sources.
 *
 * Flow:
 * 1. Check in-memory cache — return cached if fresh (30-day TTL)
 * 2. Query GPT-4o with a structured extraction prompt
 * 3. Parse the response into Partial<CourtFormattingRules>
 * 4. Cache results in memory and return
 *
 * NOTE: In-memory cache is per-process. For multi-instance deployments,
 * integrate the Convex courtRulesCache table for persistent cross-instance caching.
 */

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

/** Build a cache key from state, county, optional court name, and optional localRulesUrl. */
function getCacheKey(state: string, county: string, courtName?: string, localRulesUrl?: string): string {
    let key = courtName ? `${state}|${county}|${courtName}` : `${state}|${county}`;
    if (localRulesUrl) key += `|${localRulesUrl}`;
    return key;
}

/** Return a cached lookup result if available and not expired; otherwise null. */
function getCached(state: string, county: string, courtName?: string, localRulesUrl?: string): CourtRulesLookupResult | null {
    const key = getCacheKey(state, county, courtName, localRulesUrl);
    const entry = rulesCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        rulesCache.delete(key);
        return null;
    }
    return { ...entry.result, cached: true };
}

/** Store a lookup result in the process-local cache with TTL and FIFO eviction. */
function setCache(state: string, county: string, result: CourtRulesLookupResult, courtName?: string, localRulesUrl?: string): void {
    // Evict oldest entry if cache is full (FIFO)
    if (rulesCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = rulesCache.keys().next().value;
        if (oldestKey) rulesCache.delete(oldestKey);
    }
    rulesCache.set(getCacheKey(state, county, courtName, localRulesUrl), {
        result,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });
}

/** Whitelist of known CourtFormattingRules fields and their expected types. */
const KNOWN_RULES_FIELDS: Record<string, 'number' | 'string' | 'boolean' | 'string[]'> = {
    paperWidth: 'number',
    paperHeight: 'number',
    marginTop: 'number',
    marginBottom: 'number',
    marginLeft: 'number',
    marginRight: 'number',
    fontFamily: 'string',
    fontSize: 'number',
    lineSpacing: 'number',
    pageNumbering: 'boolean',
    pageNumberFormat: 'string',
    pageNumberPosition: 'string',
    captionStyle: 'string',
    requiresSignatureBlock: 'boolean',
    requiresCertificateOfService: 'boolean',
    requiresVerification: 'boolean',
    notes: 'string[]',
};

/**
 * Validate and whitelist model JSON output against known CourtFormattingRules fields.
 * Strips unknown fields and type-mismatched values to prevent bad data from being cached.
 */
function validateCourtFormattingRules(raw: Record<string, unknown>): Partial<CourtFormattingRules> {
    const validated: Record<string, unknown> = {};
    for (const [key, expectedType] of Object.entries(KNOWN_RULES_FIELDS)) {
        if (!(key in raw)) continue;
        const value = raw[key];
        if (expectedType === 'string[]') {
            if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
                validated[key] = value;
            }
        } else if (typeof value === expectedType) {
            validated[key] = value;
        }
    }
    return validated as Partial<CourtFormattingRules>;
}

// ── GPT-4o Rules Extraction (Direct Knowledge) ──

const EXTRACTION_PROMPT = `You are a legal formatting expert specializing in US court filing requirements.

Given a US state and county (and optionally a specific court name), provide the specific document formatting rules that apply to civil/family court filings in that jurisdiction.

Use your knowledge of:
- State-level rules of civil procedure (e.g. Texas Rules of Civil Procedure)
- Local court rules for the specific county
- General standards for the jurisdiction

Return a JSON object with ONLY the fields you can confidently state. Do NOT guess — if a rule is not established for this jurisdiction, omit that field entirely.

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
  "notes": [<array of string notes about specific local requirements>]
}

Respond with ONLY valid JSON, no markdown fences or explanation.`;

interface ExtractionResult {
    rules: Partial<CourtFormattingRules>;
    sources: string[];
    confidence: number;
}

/**
 * Use GPT-4o to determine formatting rules for a jurisdiction
 * using model knowledge, optionally enhanced with cached resource URLs.
 */
async function extractRulesWithAI(
    state: string,
    county: string,
    courtName?: string,
    localRulesUrl?: string,
): Promise<ExtractionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.warn('[courtRulesLookup] OPENAI_API_KEY not set — returning empty rules.');
        return { rules: {}, sources: [], confidence: 0 };
    }

    const openai = new OpenAI({ apiKey });

    // Build user prompt with optional enrichment from cached resources
    let userPrompt = `Provide the court filing formatting rules for ${county} County, ${state}.`;
    if (courtName) {
        userPrompt += ` Specifically for ${courtName}.`;
    }
    userPrompt += `\n\nFocus on family law / civil court filings. Include any county-specific local rules that differ from or supplement the state-level rules.`;

    if (localRulesUrl) {
        try {
            const parsed = new URL(localRulesUrl);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                userPrompt += `\n\nNote: The official local rules for this jurisdiction are published at: ${parsed.href}`;
            }
        } catch {
            // Invalid URL — skip interpolation
        }
    }

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: EXTRACTION_PROMPT },
                { role: 'user', content: userPrompt },
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

        // Validate/whitelist known fields before computing confidence
        const validatedRules = validateCourtFormattingRules(parsed);

        // Calculate confidence based on how many valid fields were extracted
        const fieldCount = Object.keys(validatedRules).length;
        const maxFields = 17; // Must match extractable fields in EXTRACTION_PROMPT
        const confidence = Math.min(fieldCount / maxFields, 1.0);

        // Build sources list from known resources
        const sources: string[] = [];
        if (localRulesUrl) sources.push(localRulesUrl);

        return {
            rules: validatedRules,
            sources,
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
 * @param localRulesUrl - Optional URL from cached resources to enrich the LLM prompt
 * @returns Partial formatting rules discovered from official sources
 */
export async function lookupCourtRules(
    state: string,
    county: string,
    courtName?: string,
    forceRefresh = false,
    localRulesUrl?: string,
): Promise<CourtRulesLookupResult> {
    // Step 1: Check cache (unless force-refreshing)
    if (!forceRefresh) {
        const cached = getCached(state, county, courtName, localRulesUrl);
        if (cached) return cached;
    }

    // Step 2: Extract rules with GPT-4o (using model knowledge + optional localRulesUrl)
    const extraction = await extractRulesWithAI(state, county, courtName, localRulesUrl);

    const result: CourtRulesLookupResult = {
        ...extraction,
        cached: false,
    };

    // Step 3: Cache for future requests
    if (extraction.confidence > 0) {
        setCache(state, county, result, courtName, localRulesUrl);
    }

    return result;
}
