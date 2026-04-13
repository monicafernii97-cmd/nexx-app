/**
 * Router Eval — tests whether the router picks the correct response mode.
 *
 * Validates that response content aligns with the expected routing mode
 * by checking for mode-specific keywords, structure, and tone markers.
 */

import type { NexxAssistantResponse } from '../../types';

/** Score result for a single evaluation dimension. */
export interface EvalScore {
    dimension: string;
    score: number; // 0–1
    notes: string;
}

// ---------------------------------------------------------------------------
// Mode-specific keyword patterns
// ---------------------------------------------------------------------------

const MODE_PATTERNS: Record<string, { keywords: RegExp; antiPatterns?: RegExp }> = {
    safety_escalation: {
        keywords: /\b(safety|crisis|emergency|danger|hotline|immediate|protect)\b/i,
        antiPatterns: /\b(strategy|judge|motion|draft)\b/i,
    },
    court_ready_drafting: {
        keywords: /\b(draft|motion|petition|court[-\s]?ready|order|filing|caption)\b/i,
    },
    judge_lens_strategy: {
        keywords: /\b(judge|bench|credibility|neutrality|court.*perception|impression)\b/i,
    },
    local_procedure: {
        keywords: /\b(procedure|filing|deadline|local.*rule|county|district|statute)\b/i,
    },
    document_analysis: {
        keywords: /\b(document|order|analysis|interpret|clause|provision|section)\b/i,
    },
    pattern_analysis: {
        keywords: /\b(pattern|trend|repeated|history|behavior|escalat|consistent)\b/i,
    },
    support_grounding: {
        keywords: /\b(support|overwhelm|stress|anxious|feeling|valid|breath|okay)\b/i,
        antiPatterns: /\b(motion|filing|statute|court[-\s]?ready)\b/i,
    },
    direct_legal_answer: {
        keywords: /\b(law|statute|legal|rights?|custody|texas|family\s+code)\b/i,
    },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a response matches its expected routing mode.
 *
 * @param response - The assistant response to evaluate
 * @param expectedMode - The mode the router should have selected
 * @returns Array of eval scores for mode alignment
 */
export function evaluateRouting(
    response: NexxAssistantResponse,
    expectedMode: string,
): EvalScore[] {
    const scores: EvalScore[] = [];
    const text = response.message;

    // 1. Keyword presence
    const pattern = MODE_PATTERNS[expectedMode];
    if (pattern) {
        const hasKeywords = pattern.keywords.test(text);
        scores.push({
            dimension: 'router_keyword_match',
            score: hasKeywords ? 1 : 0.3,
            notes: hasKeywords
                ? `Response contains ${expectedMode} keywords`
                : `Missing expected ${expectedMode} keywords`,
        });

        // 2. Anti-pattern check (for modes with exclusive content)
        if (pattern.antiPatterns) {
            const hasAntiPatterns = pattern.antiPatterns.test(text);
            scores.push({
                dimension: 'router_anti_pattern',
                score: hasAntiPatterns ? 0.3 : 1,
                notes: hasAntiPatterns
                    ? `Response contains content unexpected in ${expectedMode} mode`
                    : `No anti-patterns detected for ${expectedMode}`,
            });
        }
    } else {
        scores.push({
            dimension: 'router_keyword_match',
            score: 0.5,
            notes: `No keyword validation available for mode: ${expectedMode}`,
        });
    }

    // 3. Mode-specific structure checks
    if (expectedMode === 'court_ready_drafting') {
        const hasStructure = /\b(CAPTION|COMES NOW|RESPECTFULLY|WHEREFORE)\b/.test(text);
        scores.push({
            dimension: 'router_drafting_structure',
            score: hasStructure ? 1 : 0.5,
            notes: hasStructure ? 'Contains formal legal structure markers' : 'Missing formal legal structure',
        });
    }

    if (expectedMode === 'support_grounding') {
        const hasEmpathy = /\b(understand|hear you|valid|okay|breathe|feel)\b/i.test(text);
        scores.push({
            dimension: 'router_empathy_markers',
            score: hasEmpathy ? 1 : 0.3,
            notes: hasEmpathy ? 'Contains empathy markers' : 'Missing empathy in support mode',
        });
    }

    return scores;
}
