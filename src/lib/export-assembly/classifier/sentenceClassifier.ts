/**
 * Sentence Classifier — Sentence-level classification with tie-break rules.
 *
 * Splits text into sentences, classifies each one using the signal rules
 * engine, and returns structured SentenceClassification objects.
 *
 * This is the first layer of the classification pipeline:
 *   text → splitIntoSentences → classifySentence (per sentence) → SentenceClassification[]
 *
 * The node classifier aggregates these into node-level scores.
 */

import type {
    SentenceType,
    SentenceClassification,
} from '../types/classification';
import { SENTENCE_TYPES } from '../types/classification';
import type { WorkspaceNodeType } from '../types/workspace';
import { computeSignals, computeScores } from './signalRules';
import { extractEntities } from './entityExtractor';

// ---------------------------------------------------------------------------
// Sentence Splitting
// ---------------------------------------------------------------------------

/**
 * Split text into individual sentences.
 *
 * Handles:
 * - Period/question mark/exclamation mark boundaries
 * - Abbreviations (Mr., Mrs., Dr., etc.)
 * - Decimal numbers (§ 153.002)
 * - Newline-delimited bullet points
 */
export function splitIntoSentences(text: string): string[] {
    if (!text?.trim()) return [];

    // First, split on newlines that look like distinct items (bullets, numbered lists)
    const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);

    const sentences: string[] = [];

    for (const line of lines) {
        // Skip empty lines or pure whitespace
        if (!line) continue;

        // If the line is a short bullet/list item, treat it as one sentence
        if (/^[\-•*]\s/.test(line) || /^\d+[\.\)]\s/.test(line)) {
            sentences.push(line.replace(/^[\-•*]\s+/, '').replace(/^\d+[\.\)]\s+/, ''));
            continue;
        }

        // Split on sentence boundaries, preserving abbreviations
        // Replace common abbreviations with placeholders
        const processed = line
            .replace(/\b(Mr|Mrs|Ms|Dr|Jr|Sr|Prof|Hon|Rev|St|Ave|Blvd|Dept|Inc|Corp|Ltd|etc|vs|Tex|Fam|Civ|Crim)\./gi, '$1_DOT_')
            .replace(/\b([A-Z])\./g, '$1_DOT_')    // initials
            .replace(/(\d+)\.(\d+)/g, '$1_DECIMAL_$2'); // decimals/statutes

        // Split on sentence-ending punctuation
        const parts = processed.split(/(?<=[.!?])\s+/);

        for (const part of parts) {
            // Restore placeholders
            const restored = part
                .replace(/_DOT_/g, '.')
                .replace(/_DECIMAL_/g, '.')
                .trim();
            if (restored) sentences.push(restored);
        }
    }

    return sentences;
}

// ---------------------------------------------------------------------------
// Tie-Break Rules
// ---------------------------------------------------------------------------

/**
 * Tie-break priority (when top scores are within threshold):
 * 1. request > argument
 * 2. argument > opinion
 * 3. fact > emotion
 * 4. procedure > fact (when court-rule language is explicit)
 */
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

/** Threshold for considering scores "close" enough to trigger tie-break. */
const TIE_BREAK_THRESHOLD = 0.05;

/**
 * Determine the dominant type with tie-break rules applied.
 */
function resolveDominantType(
    scores: Record<SentenceType, number>,
    hasCourtTerms: boolean,
): SentenceType {
    // Sort types by score descending
    const sorted = [...SENTENCE_TYPES]
        .filter(t => t !== 'unknown')
        .sort((a, b) => scores[b] - scores[a]);

    const topScore = scores[sorted[0]];

    // If top score is basically 0, return unknown
    if (topScore < 0.05) return 'unknown';

    // Collect all types within tie-break threshold of top
    const candidates = sorted.filter(t => topScore - scores[t] <= TIE_BREAK_THRESHOLD);

    if (candidates.length === 1) return candidates[0];

    // Apply tie-break priority
    // Special rule: procedure > fact only when court-rule language is explicit
    if (hasCourtTerms && candidates.includes('procedure') && candidates.includes('fact')) {
        return 'procedure';
    }

    // Find highest-priority candidate
    for (const priority of TIE_BREAK_PRIORITY) {
        if ((candidates as readonly SentenceType[]).includes(priority)) {
            return priority;
        }
    }

    return sorted[0];
}

// ---------------------------------------------------------------------------
// Single Sentence Classification
// ---------------------------------------------------------------------------

/**
 * Classify a single sentence.
 *
 * Returns scores for all 11 content types, the dominant type (with
 * tie-breaks applied), confidence, extracted signals, and entities.
 */
export function classifySentence(
    sentence: string,
    sourceType: WorkspaceNodeType,
    userTags?: string[],
): SentenceClassification {
    const signals = computeSignals(sentence);
    const scores = computeScores(sentence, signals, sourceType, userTags);
    const entities = extractEntities(sentence);

    const dominantType = resolveDominantType(scores, signals.hasCourtTerm);

    // Confidence = dominant score minus second-highest score
    const sorted = SENTENCE_TYPES
        .filter(t => t !== 'unknown')
        .map(t => scores[t])
        .sort((a, b) => b - a);
    const confidence = sorted.length >= 2
        ? Math.min(1, sorted[0] - sorted[1] + sorted[0] * 0.5)
        : sorted[0] ?? 0;

    return {
        sentence,
        startIndex: 0,  // set by classifyText
        endIndex: 0,     // set by classifyText
        scores,
        dominantType,
        confidence: Math.max(0, Math.min(1, confidence)),
        extractedSignals: signals,
        extractedEntities: entities,
    };
}

// ---------------------------------------------------------------------------
// Full Text Classification
// ---------------------------------------------------------------------------

/**
 * Classify all sentences in a text block.
 *
 * Splits text into sentences, classifies each, and sets correct
 * start/end character indices.
 */
export function classifyText(
    text: string,
    sourceType: WorkspaceNodeType,
    userTags?: string[],
): SentenceClassification[] {
    const sentences = splitIntoSentences(text);
    const results: SentenceClassification[] = [];

    let searchFrom = 0;

    for (const sentence of sentences) {
        const classification = classifySentence(sentence, sourceType, userTags);

        // Find the sentence position in original text
        const idx = text.indexOf(sentence, searchFrom);
        classification.startIndex = idx >= 0 ? idx : searchFrom;
        classification.endIndex = classification.startIndex + sentence.length;
        searchFrom = classification.endIndex;

        results.push(classification);
    }

    return results;
}
