/**
 * Drafting Eval — evaluates court-ready drafting quality.
 *
 * Tests: Is the draft court-ready? Does it avoid filler?
 * Checks for legal terminology, formal structure, avoidance of
 * conversational filler, and actionable language.
 */

import type { NexxAssistantResponse } from '../../types';
import type { EvalScore } from './router-eval';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Filler phrases that undermine court-ready quality. Uses ^\s* to handle leading whitespace. */
const FILLER_PATTERNS: RegExp[] = [
    /^\s*Great question/i,
    /^\s*I'd be happy to/i,
    /^\s*Absolutely/i,
    /^\s*That's a great/i,
    /^\s*Sure thing/i,
    /^\s*Let me help/i,
    /^\s*Of course/i,
    /^\s*No problem/i,
    /\bbasically\b/i,
    /\bjust wanted to\b/i,
];

/** Formal legal structure markers. */
const STRUCTURE_MARKERS: RegExp[] = [
    /\b(COMES?\s+NOW|RESPECTFULLY|WHEREFORE|PRAYER|CONCLUSION)\b/,
    /\b(Petitioner|Respondent|Movant|Court)\b/,
    /\b(pursuant to|in accordance with|hereby)\b/i,
    /\b(motion|order|petition|affidavit|declaration)\b/i,
    /§\s*\d+/,  // Statute citations
];

/** Terms indicating actionable, specific language (not vague). */
const PRECISION_MARKERS: RegExp[] = [
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,  // Date references
    /\b(specific|exactly|precisely)\b/i,
    /\b(Texas Family Code|Tex\.\s*Fam\.\s*Code)\b/i,
    /\b(Section|§)\s*\d+\.\d+/i,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate the quality of a court-ready draft.
 *
 * @param response - The assistant response to evaluate
 * @returns Array of eval scores across drafting dimensions
 */
export function evaluateDrafting(response: NexxAssistantResponse): EvalScore[] {
    const scores: EvalScore[] = [];
    const text = response.message;

    // 1. No filler — court docs shouldn't start with conversational fluff
    const fillerFound = FILLER_PATTERNS.filter((p) => p.test(text));
    scores.push({
        dimension: 'drafting_no_filler',
        score: fillerFound.length === 0 ? 1 : Math.max(0, 1 - fillerFound.length * 0.25),
        notes: fillerFound.length === 0
            ? 'Clean opening — no conversational filler'
            : `Found ${fillerFound.length} filler pattern(s)`,
    });

    // 2. Legal structure — should contain formal document markers
    const structureHits = STRUCTURE_MARKERS.filter((p) => p.test(text)).length;
    scores.push({
        dimension: 'drafting_legal_structure',
        score: Math.min(1, structureHits / 3),
        notes: `Found ${structureHits} of ${STRUCTURE_MARKERS.length} legal structure markers`,
    });

    // 3. Precision — includes specific dates, statutes, or exact references
    const precisionHits = PRECISION_MARKERS.filter((p) => p.test(text)).length;
    scores.push({
        dimension: 'drafting_precision',
        score: Math.min(1, precisionHits / 2),
        notes: `Found ${precisionHits} precision indicator(s)`,
    });

    // 4. Substantive length — court documents should be thorough
    const wordCount = text.split(/\s+/).length;
    scores.push({
        dimension: 'drafting_substance',
        score: wordCount > 200 ? 1 : wordCount > 100 ? 0.7 : wordCount > 50 ? 0.4 : 0.1,
        notes: `${wordCount} words — ${wordCount > 200 ? 'thorough' : wordCount > 100 ? 'adequate' : 'brief'}`,
    });

    // 5. No character attacks — should describe behavior, not personality
    const characterAttacks = /\b(narcissist|crazy|psycho|manipulat(or|ive)|abuser|monster)\b/i.test(text);
    scores.push({
        dimension: 'drafting_no_character_attacks',
        score: characterAttacks ? 0 : 1,
        notes: characterAttacks
            ? 'WARNING: Contains character attacks — court docs should describe behavior, not personality'
            : 'Clean — describes behavior appropriately',
    });

    return scores;
}
