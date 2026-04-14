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
/** A sentence with both its cleaned text and original text for index tracking. */
interface SplitSentence {
    /** The cleaned sentence text (bullet markers stripped) */
    text: string;
    /** The original text as it appeared in the input (for indexOf) */
    originalText: string;
}

export function splitIntoSentences(text: string): SplitSentence[] {
    if (!text?.trim()) return [];

    // First, split on newlines that look like distinct items (bullets, numbered lists)
    const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);

    const sentences: SplitSentence[] = [];

    for (const line of lines) {
        // Skip empty lines or pure whitespace
        if (!line) continue;

        // If the line is a short bullet/list item, treat it as one sentence
        // Preserve the original line for accurate index tracking
        if (/^[\-•*]\s/.test(line) || /^\d+[\.\)]\s/.test(line)) {
            const cleaned = line.replace(/^[\-•*]\s+/, '').replace(/^\d+[\.\)]\s+/, '');
            sentences.push({ text: cleaned, originalText: line });
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
            if (restored) sentences.push({ text: restored, originalText: restored });
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
        if (candidates.some(c => c === priority)) {
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

    // Confidence = (dominant – runner-up) + 50% boost of dominant score, capped at 1.
    // The gap rewards clear separation between types; the 50% boost rewards
    // high absolute scores so a dominant 0.8 with runner-up 0.7 still gets
    // a meaningful confidence. Result can exceed 1.0 before capping (e.g.,
    // dominant=1.0, runner-up=0.0 → 1.5), which Math.min clamps to 1.
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
    const splitSentences = splitIntoSentences(text);
    const results: SentenceClassification[] = [];

    let searchFrom = 0;

    for (const { text: sentenceText, originalText } of splitSentences) {
        const classification = classifySentence(sentenceText, sourceType, userTags);

        // Use originalText (with bullet markers intact) for accurate position finding
        const idx = text.indexOf(originalText, searchFrom);
        const startIdx = idx >= 0 ? idx : searchFrom;

        // startIndex/endIndex refer to where the original text lives in the source
        classification.startIndex = startIdx;
        classification.endIndex = startIdx + originalText.length;
        searchFrom = classification.endIndex;

        results.push(classification);
    }

    return results;
}
