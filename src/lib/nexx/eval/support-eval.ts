/**
 * Support Eval — evaluates emotional support response quality.
 *
 * Tests: Is the support response warm without over-structuring?
 * Checks empathy markers, avoidance of clinical/legal language,
 * and appropriate emotional validation.
 */

import type { NexxAssistantResponse } from '../../types';
import type { EvalScore } from './router-eval';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Empathy markers that indicate warm, supportive tone. */
const EMPATHY_MARKERS: RegExp[] = [
    /\b(understand|hear you|valid|makes\s+sense)\b/i,
    /\b(feeling|emotion|overwhelm|difficult|tough|hard)\b/i,
    /\b(breathe|moment|okay|pause|space)\b/i,
    /\b(you're\s+not\s+alone|completely\s+normal|natural\s+to\s+feel)\b/i,
];

/** Over-clinical or legal language that doesn't belong in support mode. */
const CLINICAL_PATTERNS: RegExp[] = [
    /\b(pursuant to|hereby|WHEREFORE|COMES NOW)\b/i,
    /\b(statute|filing|motion|petition|court[-\s]?ready)\b/i,
    /\b(diagnosis|patholog|disorder|DSM)\b/i,
];

/** Over-structuring indicators — too many headers/bullets for support. */
const STRUCTURE_OVERLOAD = /^(\s*[-•*]\s+|\s*#{1,3}\s+|\s*\d+\.\s+)/gm;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate the quality of an emotional support response.
 *
 * @param response - The assistant response to evaluate
 * @returns Array of eval scores across support dimensions
 */
export function evaluateSupport(response: NexxAssistantResponse): EvalScore[] {
    const scores: EvalScore[] = [];
    const text = response.message;

    // 1. Empathy presence — should have warm, validating language
    const empathyHits = EMPATHY_MARKERS.filter((p) => p.test(text)).length;
    scores.push({
        dimension: 'support_empathy',
        score: Math.min(1, empathyHits / 2),
        notes: `Found ${empathyHits} of ${EMPATHY_MARKERS.length} empathy marker groups`,
    });

    // 2. No clinical/legal language — support mode should feel human
    const clinicalHits = CLINICAL_PATTERNS.filter((p) => p.test(text)).length;
    scores.push({
        dimension: 'support_no_clinical',
        score: clinicalHits === 0 ? 1 : Math.max(0, 1 - clinicalHits * 0.3),
        notes: clinicalHits === 0
            ? 'Clean — no clinical or legal jargon'
            : `Found ${clinicalHits} clinical/legal term(s) in support response`,
    });

    // 3. Not over-structured — support should breathe, not list
    const structureMatches = text.match(STRUCTURE_OVERLOAD);
    const structureCount = structureMatches?.length ?? 0;
    const wordCount = text.split(/\s+/).length;
    const structureRatio = structureCount / Math.max(1, wordCount / 20); // Normalized per ~paragraph

    scores.push({
        dimension: 'support_not_overstructured',
        score: structureRatio < 0.5 ? 1 : structureRatio < 1 ? 0.6 : 0.2,
        notes: `${structureCount} list/header items — ${structureRatio < 0.5 ? 'appropriate density' : 'over-structured for support'}`,
    });

    // 4. Appropriate length — not too brief, not overly long
    scores.push({
        dimension: 'support_appropriate_length',
        score: wordCount >= 50 && wordCount <= 400 ? 1 : wordCount >= 30 ? 0.6 : 0.2,
        notes: `${wordCount} words — ${wordCount >= 50 && wordCount <= 400 ? 'appropriate' : wordCount > 400 ? 'may be too long' : 'too brief'}`,
    });

    // 5. No advice overload — support should validate before advising
    const adviceMarkers = /\b(you\s+should|you\s+need\s+to|make\s+sure|don't\s+forget)\b/gi;
    const adviceCount = text.match(adviceMarkers)?.length ?? 0;
    scores.push({
        dimension: 'support_not_preachy',
        score: adviceCount <= 1 ? 1 : adviceCount <= 3 ? 0.6 : 0.2,
        notes: `${adviceCount} directive phrase(s) — ${adviceCount <= 1 ? 'gentle' : 'may feel preachy'}`,
    });

    return scores;
}
