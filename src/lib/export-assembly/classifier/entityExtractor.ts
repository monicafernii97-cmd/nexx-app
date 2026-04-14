/**
 * Entity Extractor — Regex + pattern-based entity extraction.
 *
 * Extracts named entities from text without LLM calls:
 * - People (proper names)
 * - Dates (various formats)
 * - Locations (city/state patterns, addresses)
 * - Courts (court name patterns)
 * - Filings (document type references)
 * - Exhibits (exhibit labels)
 * - Statutes/Rules (legal citation patterns)
 */

import type { ExtractedEntities } from '../types/classification';
import { emptyEntities } from '../types/classification';

// ---------------------------------------------------------------------------
// Extraction Patterns
// ---------------------------------------------------------------------------

/**
 * Date patterns — covers ISO, US, and natural language date formats.
 */
const DATE_REGEXES: RegExp[] = [
    // ISO: 2024-01-15
    /\b(\d{4}-\d{2}-\d{2})\b/g,
    // US: 01/15/2024, 1/15/24
    /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g,
    // Natural: January 15, 2024 | Jan 15, 2024 | Jan. 15, 2024
    /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4})\b/gi,
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s*\d{4})\b/gi,
];

/**
 * Court name patterns.
 */
const COURT_REGEXES: RegExp[] = [
    // "District Court of [County], Texas"
    /\b((?:District|County|Family|Probate|Circuit|Superior)\s+Court\s+(?:of|for)\s+[\w\s]+(?:County|District|Parish)?(?:,\s*\w+)?)\b/gi,
    // "XXXth Judicial District Court"
    /\b(\d+(?:st|nd|rd|th)\s+(?:Judicial\s+)?District\s+Court)\b/gi,
    // "In the [X] Court"
    /\b((?:Supreme|Appellate|Appeals?)\s+Court\s+(?:of\s+)?[\w\s]+)\b/gi,
];

/**
 * Filing/document type patterns.
 */
const FILING_REGEXES: RegExp[] = [
    /\b(Motion\s+(?:to|for)\s+[\w\s]+?)(?:\.|,|;|\n)/gi,
    /\b((?:Original|Amended|Supplemental)\s+Petition)\b/gi,
    /\b((?:Temporary|Permanent)\s+(?:Restraining|Protective)\s+Order)\b/gi,
    /\b(Notice\s+of\s+[\w\s]+?)(?:\.|,|;|\n)/gi,
    /\b(Affidavit\s+(?:of|in)\s+[\w\s]+?)(?:\.|,|;|\n)/gi,
    /\b(Declaration\s+(?:of|in)\s+[\w\s]+?)(?:\.|,|;|\n)/gi,
    /\b(Certificate\s+of\s+Service)\b/gi,
    /\b(Proposed\s+Order)\b/gi,
    /\b(Response\s+to\s+[\w\s]+?)(?:\.|,|;|\n)/gi,
];

/**
 * Exhibit label patterns.
 */
const EXHIBIT_REGEXES: RegExp[] = [
    /\b(Exhibit\s+[A-Z](?:\d*)?)\b/gi,
    /\b(Exhibit\s+\d+)\b/gi,
    /\b((?:Petitioner|Respondent|Movant|Plaintiff|Defendant)['']?s?\s+Exhibit\s+\d+)\b/gi,
    /\b(Attachment\s+[A-Z0-9]+)\b/gi,
    /\b(Appendix\s+[A-Z0-9]+)\b/gi,
];

/**
 * Statute/rule citation patterns.
 */
const STATUTE_REGEXES: RegExp[] = [
    // § 153.002
    /\b(§\s*\d+(?:\.\d+)*)\b/g,
    // Section 153.002
    /\b(Section\s+\d+(?:\.\d+)*)\b/gi,
    // Tex. Fam. Code § 153
    /\b(Tex\.\s*Fam\.\s*Code\s*§?\s*\d+(?:\.\d+)*)\b/gi,
    // TFC §
    /\b(T\.?F\.?C\.?\s*§\s*\d+(?:\.\d+)*)\b/gi,
    // Rule 21a
    /\b(Rule\s+\d+[a-z]?)\b/gi,
    // Fed. R. Civ. P. 12(b)(6)
    /\b(Fed\.\s*R\.\s*Civ\.\s*P\.\s*\d+(?:\([a-z]\))*)\b/gi,
    // Case citations: Smith v. Jones
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+v\.\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g,
];

/**
 * People name patterns — proper names (2+ capitalized words).
 * Excludes common false positives.
 */
const NAME_FALSE_POSITIVES = new Set([
    'The Court', 'District Court', 'Family Court', 'Supreme Court',
    'United States', 'State of', 'County of', 'In Re',
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
    'Saturday', 'Sunday',
    'Exhibit A', 'Exhibit B', 'Exhibit C',
    'Certificate of Service', 'Proposed Order',
]);

/**
 * Location patterns — city/state, addresses.
 */
const LOCATION_REGEXES: RegExp[] = [
    // City, State (2-letter)
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2})\b/g,
    // City, State (full)
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:Texas|California|New York|Florida|Illinois|Ohio|Georgia|Pennsylvania))\b/g,
    // County references — limited to 1-3 capitalized words before "County"
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+County)\b/g,
];

// ---------------------------------------------------------------------------
// Main Extraction Function
// ---------------------------------------------------------------------------

/**
 * Extract all named entities from a text block.
 *
 * Uses regex patterns — no LLM required.
 * Deduplicates all results.
 */
export function extractEntities(text: string): ExtractedEntities {
    const entities = emptyEntities();

    /**
     * matchAll with a fresh regex copy — avoids shared lastIndex state
     * when module-level /g regexes are reused across calls.
     */
    function matchAllFresh(input: string, regex: RegExp): IterableIterator<RegExpMatchArray> {
        return input.matchAll(new RegExp(regex.source, regex.flags));
    }

    /** Push all capture-group-1 matches from a regex array. */
    function pushMatches(regexes: RegExp[], target: string[]) {
        for (const regex of regexes) {
            for (const m of matchAllFresh(text, regex)) {
                if (m[1]) target.push(m[1].trim());
            }
        }
    }

    // ── Dates ──
    pushMatches(DATE_REGEXES, entities.dates);

    // ── Courts ──
    pushMatches(COURT_REGEXES, entities.courts);

    // ── Filings ──
    pushMatches(FILING_REGEXES, entities.filings);

    // ── Exhibits ──
    pushMatches(EXHIBIT_REGEXES, entities.exhibits);

    // ── Statutes/Rules ──
    pushMatches(STATUTE_REGEXES, entities.statutesOrRules);

    // ── People (proper names: 2+ capitalized words) ──
    const nameMatches = text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g);
    for (const m of nameMatches) {
        const name = m[1].trim();
        // Skip false positives and names that overlap with court references
        // (e.g., "Family Court" when courts has "Family Court of Harris")
        const isCourtFragment = entities.courts.some(c => c.includes(name) || name.includes(c));
        if (!NAME_FALSE_POSITIVES.has(name) && !isCourtFragment) {
            entities.people.push(name);
        }
    }

    // ── Locations ──
    pushMatches(LOCATION_REGEXES, entities.locations);

    // ── Deduplicate all arrays ──
    entities.people = [...new Set(entities.people)];
    entities.dates = [...new Set(entities.dates)];
    entities.locations = [...new Set(entities.locations)];
    entities.courts = [...new Set(entities.courts)];
    entities.filings = [...new Set(entities.filings)];
    entities.exhibits = [...new Set(entities.exhibits)];
    entities.statutesOrRules = [...new Set(entities.statutesOrRules)];

    return entities;
}

/**
 * Merge two ExtractedEntities objects, deduplicating.
 */
export function mergeEntities(a: ExtractedEntities, b: ExtractedEntities): ExtractedEntities {
    return {
        people: [...new Set([...a.people, ...b.people])],
        dates: [...new Set([...a.dates, ...b.dates])],
        locations: [...new Set([...a.locations, ...b.locations])],
        courts: [...new Set([...a.courts, ...b.courts])],
        filings: [...new Set([...a.filings, ...b.filings])],
        exhibits: [...new Set([...a.exhibits, ...b.exhibits])],
        statutesOrRules: [...new Set([...a.statutesOrRules, ...b.statutesOrRules])],
    };
}
