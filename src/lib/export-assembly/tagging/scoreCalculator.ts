/**
 * Score Calculator — Aggregates sentence-level scores into node-level scores.
 *
 * Takes an array of SentenceClassification objects and produces:
 * - ContentScoreSet: aggregate scores per content type
 * - Dominant type (with tie-break rules)
 * - Confidence score
 */

import type {
    SentenceType,
    SentenceClassification,
    ContentScoreSet,
} from '../types/classification';
import { SENTENCE_TYPES, emptyScores } from '../types/classification';

// ---------------------------------------------------------------------------
// Tie-Break Priority (duplicated from sentenceClassifier for node-level)
// ---------------------------------------------------------------------------

const TIE_BREAK_PRIORITY: SentenceType[] = [
    'request',
    'procedure',
    'argument',
    'fact',
    'timeline_event',
    'evidence_reference',
    'issue',
    'risk',
    'opinion',
    'emotion',
    'unknown',
];

const TIE_BREAK_THRESHOLD = 0.05;

// ---------------------------------------------------------------------------
// Score Aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate sentence scores into a single node-level ContentScoreSet.
 *
 * Uses weighted average based on sentence length (longer sentences
 * contribute more to the final score).
 */
export function aggregateContentScores(
    sentences: SentenceClassification[],
): ContentScoreSet {
    if (sentences.length === 0) return emptyScores();

    const totalLength = sentences.reduce((sum, s) => sum + s.sentence.length, 0);
    const scores = emptyScores();

    for (const sentence of sentences) {
        const weight = totalLength > 0 ? sentence.sentence.length / totalLength : 1 / sentences.length;

        for (const type of SENTENCE_TYPES) {
            scores[type] += sentence.scores[type] * weight;
        }
    }

    // Clamp to [0, 1]
    for (const type of SENTENCE_TYPES) {
        scores[type] = Math.max(0, Math.min(1, scores[type]));
    }

    return scores;
}

/**
 * Determine the dominant content type for a node.
 *
 * Applies the same tie-break rules as sentence-level:
 * - request > argument
 * - argument > opinion
 * - fact > emotion
 * - procedure > fact when court-rule language explicit
 */
export function getDominantType(scores: ContentScoreSet): SentenceType {
    const sorted = [...SENTENCE_TYPES]
        .filter(t => t !== 'unknown')
        .sort((a, b) => scores[b] - scores[a]);

    const topScore = scores[sorted[0]];
    if (topScore < 0.05) return 'unknown';

    const candidates = sorted.filter(t => topScore - scores[t] <= TIE_BREAK_THRESHOLD);

    if (candidates.length === 1) return candidates[0];

    // Apply tie-break priority
    for (const priority of TIE_BREAK_PRIORITY) {
        if ((candidates as readonly SentenceType[]).includes(priority)) {
            return priority;
        }
    }

    return sorted[0];
}

/**
 * Calculate confidence in the dominant classification.
 *
 * Higher confidence when the dominant score is well above the second-highest.
 * Lower confidence when multiple types score similarly.
 */
export function getConfidence(scores: ContentScoreSet): number {
    const sorted = SENTENCE_TYPES
        .filter(t => t !== 'unknown')
        .map(t => scores[t])
        .sort((a, b) => b - a);

    if (sorted.length < 2) return sorted[0] ?? 0;

    // Confidence = (top - second) + top * 0.3
    // Ranges from ~0 (tied) to ~1 (clear winner)
    const raw = (sorted[0] - sorted[1]) + sorted[0] * 0.3;
    return Math.max(0, Math.min(1, raw));
}
