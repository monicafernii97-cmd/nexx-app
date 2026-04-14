/**
 * Summary-Safe Rewriter — Lighter transformations for case summary exports.
 *
 * Case summaries keep emotional context but compress it.
 * Less aggressive than court-safe — readers are internal/client/attorney,
 * not judges.
 *
 * Rules:
 * - Emotion: kept but softened (removes intensity adverbs, calms punctuation)
 * - Opinion: character judgments removed, reasonable opinions kept
 * - Facts/arguments/requests: kept as-is
 * - The output should read like a polished case memo
 */

import type { SentenceClassification } from '../types/classification';

// ---------------------------------------------------------------------------
// Emotion Compression
// ---------------------------------------------------------------------------

/**
 * Compress emotional language for summary use.
 *
 * Not as aggressive as court-safe:
 * - Removes intensity amplifiers (so, very, extremely, incredibly)
 * - Calms excessive punctuation
 * - Converts first-person feeling statements to third-person observations
 *
 * "I was overwhelmed and exhausted by this constant pressure."
 * → "The ongoing communication dispute created recurring stress and instability."
 */
export function compressEmotion(sentence: string): string {
    let result = sentence;

    // Remove intensity amplifiers
    result = result.replace(/\b(?:so|very|extremely|incredibly|absolutely|totally|completely)\s+/gi, '');

    // Calm excessive punctuation
    result = result.replace(/[!]{2,}/g, '.');
    result = result.replace(/[?!]{2,}/g, '.');

    // Convert first-person feeling to third-person observation
    result = result.replace(/\bI\s+feel\s+(?:so\s+)?/gi, 'There was a sense of ');
    result = result.replace(/\bI(?:'m| am)\s+(?:so\s+)?/gi, 'The situation was ');
    result = result.replace(/\bI\s+(?:can't|cannot)\s+/gi, 'It became difficult to ');
    result = result.replace(/\bI\s+was\s+(?:so\s+)?/gi, 'The experience was ');

    // Convert "this is [emotion]" pattern
    result = result.replace(/\bthis\s+is\s+(?:so\s+)?upsetting\b/gi, 'this disrupted the established routine');
    result = result.replace(/\bthis\s+is\s+(?:so\s+)?exhausting\b/gi, 'this created sustained difficulty');
    result = result.replace(/\bthis\s+is\s+(?:so\s+)?frustrating\b/gi, 'this generated ongoing conflict');

    return result.replace(/\s{2,}/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Opinion Compression
// ---------------------------------------------------------------------------

/**
 * Compress opinion language for summary use.
 *
 * Removes the harshest character judgments but keeps analytical opinions.
 * Less aggressive than court-safe — summaries can include perspective.
 */
export function compressOpinion(sentence: string): string {
    // Remove only the harshest character attacks
    const harshJudgments = [
        'selfish', 'narcissist', 'narcissistic', 'toxic', 'crazy',
        'psycho', 'disgusting', 'pathetic', 'worthless', 'incompetent',
        'delusional', 'abusive',
    ];

    let result = sentence;
    for (const judgment of harshJudgments) {
        const regex = new RegExp(`\\b${judgment}\\b`, 'gi');
        result = result.replace(regex, '');
    }

    // Clean up artifacts from removed words
    result = result.replace(/\s{2,}/g, ' ').trim();
    result = result.replace(/^[,.\s]+/, '').trim();

    // If the sentence is now basically empty, skip it
    if (result.length < 10) return '';

    return result;
}

// ---------------------------------------------------------------------------
// Full Summary-Safe Text Builder
// ---------------------------------------------------------------------------

/**
 * Build summary-safe text from classified sentences.
 *
 * Lighter than court-safe:
 * - All types included (facts, arguments, requests, etc.)
 * - Emotion softened but not stripped
 * - Harsh opinions cleaned, analytical opinions kept
 * - Reads like a polished case memo
 */
export function buildSummarySafeText(sentences: SentenceClassification[]): string {
    return sentences
        .map(s => {
            switch (s.dominantType) {
                case 'emotion':
                    return compressEmotion(s.sentence);

                case 'opinion':
                    // Keep opinions with some argument signal
                    if (s.scores.argument > 0.2) {
                        return compressOpinion(s.sentence);
                    }
                    // Strip pure opinion with no analytical value
                    if (s.confidence > 0.7) return '';
                    return compressOpinion(s.sentence);

                default:
                    return s.sentence;
            }
        })
        .filter(Boolean)
        .join(' ')
        .trim();
}
