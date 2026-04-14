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

    // Split on paragraph breaks (2+ newlines); single newlines within
    // paragraphs may be soft wraps or list items.
    const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

    const sentences: SplitSentence[] = [];

    /** Returns true if the line looks like a bullet or numbered list item. */
    const isList = (l: string) => /^[-•*]\s/.test(l) || /^\d+[.)\]]\s/.test(l);

    for (const para of paragraphs) {
        const lines = para.split(/\n/).map(l => l.trim()).filter(Boolean);

        // If any line in the paragraph is a list item, treat every line
        // individually (preserves bullets and numbered items).
        const hasList = lines.some(isList);

        if (hasList) {
            for (const line of lines) {
                if (isList(line)) {
                    const cleaned = line.replace(/^[-•*]\s+/, '').replace(/^\d+[.)\]]\s+/, '');
                    sentences.push({ text: cleaned, originalText: line });
                } else {
                    sentences.push({ text: line, originalText: line });
                }
            }
            continue;
        }

        // Non-list paragraph: collapse internal single newlines into spaces
        // so soft-wrapped prose becomes a single block, then split on
        // sentence-ending punctuation.
        const collapsed = lines.join(' ');

        // Replace common abbreviations with placeholders.
        // Only mask true initials/acronyms (sequences like 'J. K.' or 'U.S.')
        // so labels like 'Exhibit A.' are not masked.
        const processed = collapsed
            .replace(/\b(Mr|Mrs|Ms|Dr|Jr|Sr|Prof|Hon|Rev|St|Ave|Blvd|Dept|Inc|Corp|Ltd|etc|vs|Tex|Fam|Civ|Crim)\./gi, '$1_DOT_')
            .replace(/(?:[A-Z]\.){2,}/g, match => match.replace(/\./g, '_DOT_'))  // multi-initial sequences
            .replace(/(?<!\b(?:Exhibit|Annex|Figure|Table|Schedule)\s)\b([A-Z])\.(?=\s+[A-Z][a-z])/g, '$1_DOT_')  // single initial before name (not labels)
            .replace(/(\d+)\.(\d+)/g, '$1_DECIMAL_$2'); // decimals/statutes

        // Split on sentence-ending punctuation
        const parts = processed.split(/(?<=[.!?])\s+/);

        // Track position in collapsed string to preserve raw originalText
        let searchFrom = 0;
        for (const part of parts) {
            // Restore placeholders
            const restored = part
                .replace(/_DOT_/g, '.')
                .replace(/_DECIMAL_/g, '.')
                .trim();
            if (!restored) continue;

            // Find the raw span in the collapsed source for originalText
            const idx = collapsed.indexOf(restored, searchFrom);
            if (idx >= 0) {
                sentences.push({ text: restored, originalText: collapsed.slice(idx, idx + restored.length) });
                searchFrom = idx + restored.length;
            } else {
                // Fallback — use restored if exact span not found
                sentences.push({ text: restored, originalText: restored });
            }
        }
    }

    return sentences;
}

// ---------------------------------------------------------------------------
// Tie-Break Rules
// ---------------------------------------------------------------------------

/**
 * Tie-break priority order (when top scores are within threshold):
 * 1. request — most specific legal ask
 * 2. fact — verifiable factual statement
 * 3. argument — legal reasoning / persuasion
 * 4. procedure — court-rule language (promoted over fact when hasCourtTerms)
 * 5. timeline_event — chronological events
 * 6. evidence_reference — citations to exhibits/documents
 * 7. issue — legal issue identification
 * 8. risk — risk statements
 * 9. opinion — subjective views
 * 10. emotion — emotional language
 */
const TIE_BREAK_PRIORITY: SentenceType[] = [
    'request',
    'fact',
    'argument',
    'procedure',
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

    // Find highest-priority candidate.
    // When 'fact' is the current pick but 'procedure' is also a candidate
    // and court-rule language is present, promote 'procedure' over 'fact'.
    for (const priority of TIE_BREAK_PRIORITY) {
        if (candidates.some(c => c === priority)) {
            if (
                priority === 'fact' &&
                hasCourtTerms &&
                candidates.some(c => c === 'procedure')
            ) {
                return 'procedure';
            }
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
    // Uses the resolved dominantType score (not raw top score) so confidence
    // reflects the tie-broken result. Runner-up is the best score among all
    // types excluding dominantType.
    const dominantScore = scores[dominantType];
    const runnerUp = SENTENCE_TYPES
        .filter(t => t !== 'unknown' && t !== dominantType)
        .reduce((max, t) => Math.max(max, scores[t]), 0);
    const confidence = dominantScore > 0
        ? Math.min(1, dominantScore - runnerUp + dominantScore * 0.5)
        : 0;

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

    // Normalize text by collapsing single newlines into spaces (matching
    // the collapsed form used in splitIntoSentences) so indexOf lookups
    // align with the originalText stored during splitting.
    const normalized = text.replace(/\n(?!\n)/g, ' ');
    let searchFrom = 0;

    for (const { text: sentenceText, originalText } of splitSentences) {
        const classification = classifySentence(sentenceText, sourceType, userTags);

        // Use originalText (with bullet markers intact) for accurate position finding
        const idx = normalized.indexOf(originalText, searchFrom);
        const startIdx = idx >= 0 ? idx : searchFrom;

        // startIndex/endIndex refer to where the original text lives in the source
        classification.startIndex = startIdx;
        classification.endIndex = startIdx + originalText.length;
        searchFrom = classification.endIndex;

        results.push(classification);
    }

    return results;
}
