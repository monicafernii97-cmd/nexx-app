/**
 * Court-Safe Rewriter — Deterministic text transformations for court exports.
 *
 * NOT LLM-based. Uses pattern matching and rule-based replacement.
 *
 * Rules:
 * - Emotion → Impact phrasing
 * - Opinion → Objective description or strip
 * - Speculation → Supportable phrasing
 * - Raw insults → Strip entirely
 * - Never let raw emotional text flow into court output
 */

import type { SentenceClassification } from '../types/classification';

// ---------------------------------------------------------------------------
// Emotion → Impact Transformations
// ---------------------------------------------------------------------------

const EMOTION_TO_IMPACT: [RegExp, string][] = [
    [/\bi(?:'m| am)\s+(?:so\s+)?overwhelmed\b/gi, 'This created recurring conflict'],
    [/\bthis\s+is\s+(?:so\s+)?exhausting\b/gi, 'This increased instability'],
    [/\bthis\s+is\s+(?:so\s+)?upsetting\b/gi, 'This disrupted routine'],
    [/\bi(?:'m| am)\s+(?:so\s+)?frustrated\b/gi, 'This created ongoing difficulty'],
    [/\bi(?:'m| am)\s+(?:so\s+)?stressed\b/gi, 'This caused recurring disruption'],
    [/\bi\s+feel\s+(?:so\s+)?(?:helpless|hopeless)\b/gi, 'This limited effective co-parenting'],
    [/\bi\s+(?:can't|cannot)\s+(?:take|handle)\s+(?:this|it)\s+anymore\b/gi, 'This created an unsustainable situation'],
    [/\bi(?:'m| am)\s+(?:so\s+)?worried\b/gi, 'This raised concerns about stability'],
    [/\bi(?:'m| am)\s+(?:so\s+)?scared\b/gi, 'This created safety concerns'],
    [/\bi(?:'m| am)\s+(?:so\s+)?angry\b/gi, 'This produced significant conflict'],
    [/\bi(?:'m| am)\s+(?:so\s+)?hurt\b/gi, 'This adversely affected the co-parenting dynamic'],
    [/\bi\s+feel\s+(?:so\s+)?(?:anxious|panicked)\b/gi, 'This caused ongoing uncertainty'],
    [/\bthis\s+(?:is|has\s+been)\s+(?:a\s+)?nightmare\b/gi, 'This created substantial ongoing difficulty'],
    [/\bi\s+(?:can't|cannot)\s+(?:sleep|eat|focus)\b/gi, 'This affected daily functioning'],
    [/\bi(?:'m| am)\s+(?:at\s+)?(?:my\s+)?(?:wit's|wits'?)\s+end\b/gi, 'This situation has become untenable'],
];

/**
 * Transform emotional language to impact phrasing.
 *
 * "I'm overwhelmed" → "This created recurring conflict"
 * "This is exhausting" → "This increased instability"
 */
export function transformEmotionToImpact(sentence: string): string {
    for (const [pattern, replacement] of EMOTION_TO_IMPACT) {
        if (pattern.test(sentence)) {
            return sentence.replace(pattern, replacement);
        }
    }

    // Fallback: if it's a pure feeling statement, return empty
    if (/\bi\s+feel\b/i.test(sentence) && sentence.length < 80) {
        return '';
    }

    return sentence;
}

// ---------------------------------------------------------------------------
// Opinion → Objective Transformations
// ---------------------------------------------------------------------------

const OPINION_TO_OBJECTIVE: [RegExp, string][] = [
    [/\b(?:he|she)\s+(?:is|was)\s+(?:so\s+)?controlling\b/gi,
        'Respondent insisted on requirements not expressly stated in the order'],
    [/\b(?:he|she)\s+(?:is|was)\s+(?:so\s+)?ridiculous\b/gi,
        'The position taken was inconsistent with the parties\' prior practice'],
    [/\b(?:he|she)\s+(?:is|was)\s+(?:so\s+)?manipulat(?:ive|ing)\b/gi,
        'The repeated demands had the effect of increasing conflict'],
    [/\b(?:he|she)\s+did\s+this\s+to\s+(?:manipulate|control|hurt|punish)\s+me\b/gi,
        'The repeated demands had the effect of increasing conflict and requiring repeated responses'],
    [/\b(?:he|she)\s+(?:is|was)\s+(?:a\s+)?(?:narcissist|narcissistic)\b/gi,
        'The conduct described was inconsistent with cooperative co-parenting'],
    [/\b(?:he|she)\s+(?:is|was)\s+(?:so\s+)?(?:selfish|self-centered)\b/gi,
        'The party\'s actions prioritized their own preferences over the established arrangement'],
    [/\b(?:he|she)\s+(?:is|was)\s+(?:a\s+)?liar\b/gi,
        'The party\'s representations were inconsistent with documented facts'],
    [/\b(?:he|she)\s+(?:is|was)\s+(?:so\s+)?(?:abusive|toxic)\b/gi,
        'The conduct described was detrimental to the co-parenting relationship'],
    [/\b(?:he|she)\s+(?:always|never)\s+/gi,
        'The party frequently '],
    [/\b(?:he|she)\s+doesn(?:'t|t)\s+care\s+about\b/gi,
        'The party did not adequately address'],
];

/**
 * Transform opinion/judgment language to objective phrasing.
 *
 * "He was controlling" → "Respondent insisted on requirements not expressly stated in the order"
 * "She was ridiculous" → "The position taken was inconsistent with the parties' prior practice"
 */
export function transformOpinionToObjective(sentence: string): string {
    for (const [pattern, replacement] of OPINION_TO_OBJECTIVE) {
        if (pattern.test(sentence)) {
            return sentence.replace(pattern, replacement);
        }
    }
    return sentence;
}

// ---------------------------------------------------------------------------
// Raw Insult Stripping
// ---------------------------------------------------------------------------

const RAW_INSULTS = [
    'idiot', 'stupid', 'moron', 'loser', 'psycho', 'crazy',
    'bitch', 'asshole', 'jerk', 'scumbag', 'trash', 'worthless',
    'pathetic', 'disgusting', 'piece of', 'pos', 'p.o.s.',
];

/**
 * Strip sentences containing raw insults entirely.
 * These should never appear in court documents.
 */
export function stripRawInsults(text: string): string {
    const lower = text.toLowerCase();
    if (RAW_INSULTS.some(insult => lower.includes(insult))) {
        return '';
    }
    return text;
}

// ---------------------------------------------------------------------------
// Full Court-Safe Text Builder
// ---------------------------------------------------------------------------

/**
 * Build court-safe text from classified sentences.
 *
 * - Facts, arguments, requests, procedures → kept as-is
 * - Emotion → transformed to impact phrasing
 * - Opinion → transformed to objective phrasing or stripped
 * - Raw insults → stripped entirely
 * - Unknown → included only if fact signal is strong
 */
export function buildCourtSafeText(sentences: SentenceClassification[]): string {
    const courtSafe: string[] = [];

    for (const s of sentences) {
        // First, check for raw insults
        const cleaned = stripRawInsults(s.sentence);
        if (!cleaned) continue;

        switch (s.dominantType) {
            case 'fact':
            case 'argument':
            case 'request':
            case 'procedure':
            case 'evidence_reference':
            case 'timeline_event':
            case 'issue':
            case 'risk':
                courtSafe.push(cleaned);
                break;

            case 'emotion': {
                const transformed = transformEmotionToImpact(cleaned);
                if (transformed) courtSafe.push(transformed);
                break;
            }

            case 'opinion': {
                // Only include if there's meaningful argument signal
                if (s.scores.argument > 0.3) {
                    const objective = transformOpinionToObjective(cleaned);
                    courtSafe.push(objective);
                }
                break;
            }

            case 'unknown':
                if (s.scores.fact > 0.2) courtSafe.push(cleaned);
                break;
        }
    }

    return courtSafe.join(' ').trim();
}
