/**
 * Legal Statute Search via Tavily
 *
 * Provides real-time, citable family law statute references by searching
 * official .gov sources through the Tavily web search API.
 */

import { tavily } from '@tavily/core';
import type { LegalSearchResult } from '@/lib/types';

// ── Topic Detection ──────────────────────────────────────────────────────────

/**
 * Family law keywords used for topic detection.
 * If the user's message contains any of these terms, we trigger a statute search.
 */
const LEGAL_KEYWORDS = [
    'custody',
    'visitation',
    'parenting plan',
    'parenting time',
    'child support',
    'alimony',
    'spousal support',
    'spousal maintenance',
    'contempt',
    'modification',
    'guardian ad litem',
    'protective order',
    'restraining order',
    'court order',
    'filing',
    'petition',
    'motion',
    'statute',
    'family code',
    'divorce',
    'separation',
    'parental rights',
    'best interest',
    'mediation',
    'custody evaluation',
    'custody arrangement',
    'legal separation',
    'child custody',
    'joint custody',
    'sole custody',
    'timesharing',
    'time-sharing',
    'parental responsibility',
    'conservatorship',
];

/**
 * Pre-compiled regex for fast topic detection.
 * Uses word boundaries to avoid false positives (e.g. "petitioner" matching "petition").
 * Actually for legal context, matching "petitioner" IS desired, so we use partial boundaries.
 */
const LEGAL_PATTERN = new RegExp(
    LEGAL_KEYWORDS.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
    'i'
);

/**
 * Detects whether a message contains family law topics.
 * Simple keyword heuristic — no AI call needed.
 */
export function detectLegalTopic(message: string): boolean {
    if (!message || typeof message !== 'string') return false;
    return LEGAL_PATTERN.test(message);
}

// ── Tavily Search ────────────────────────────────────────────────────────────

/**
 * Lazily initialised Tavily client.
 * Returns null if the API key is not configured (graceful degradation).
 */
function getTavilyClient() {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
        console.warn('[legal/search] TAVILY_API_KEY is not set — statute search disabled.');
        return null;
    }
    return tavily({ apiKey });
}

/**
 * Search for state-specific family law statutes via Tavily.
 *
 * @param state  - US state name (e.g. "Texas", "California")
 * @param query  - The user's message or extracted legal query
 * @param county - Optional county for more specific results
 * @returns Array of { title, url, snippet } from official .gov sources
 */
export async function searchStatutes(
    state: string,
    query: string,
    county?: string
): Promise<LegalSearchResult[]> {
    const client = getTavilyClient();
    if (!client) return [];

    try {
        const searchQuery = county
            ? `${state} ${county} County family law ${query}`
            : `${state} family law ${query}`;

        const response = await client.search(searchQuery, {
            maxResults: 5,
            includeDomains: ['.gov'],
            searchDepth: 'advanced',
        });

        if (!response.results || response.results.length === 0) {
            return [];
        }

        return response.results.map((result) => ({
            title: result.title || 'Untitled',
            url: result.url,
            snippet: result.content || '',
        }));
    } catch (error) {
        // Graceful degradation — log the error but don't break chat
        console.error('[legal/search] Tavily search failed:', error);
        return [];
    }
}
