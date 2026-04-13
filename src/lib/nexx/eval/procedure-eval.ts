/**
 * Procedure Eval — evaluates jurisdiction-specific procedure responses.
 *
 * Tests: Does it cite the correct jurisdiction?
 * Validates state/county/court specificity, deadline awareness,
 * and proper statutory references.
 */

import type { NexxAssistantResponse } from '../../types';
import type { EvalScore } from './router-eval';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Jurisdiction specificity markers — indicates localized knowledge. */
const JURISDICTION_MARKERS: RegExp[] = [
    /\b(Texas|Tex\.|TX)\b/i,
    /\b(Family Code|Fam\.\s*Code)\b/i,
    /\b(county|district|court)\b/i,
    /\b(local\s+rule|standing\s+order)\b/i,
];

/** Deadline/timeline awareness markers. */
const DEADLINE_MARKERS: RegExp[] = [
    /\b(deadline|due|within\s+\d+\s+(days?|business\s+days?))\b/i,
    /\b(file\s+by|filing\s+deadline|service\s+requirement)\b/i,
    /\b(calendar|business\s+days?|work(?:ing)?\s+days?)\b/i,
];

/** Statutory reference patterns. */
const STATUTE_MARKERS: RegExp[] = [
    /§\s*\d+/,
    /\bSection\s+\d+\.\d+/i,
    /\bTex\.\s*Fam\.\s*Code\b/i,
    /\bTex\.\s*R\.\s*Civ\.\s*P\.\b/i,
    /\bFed\.\s*R\.\s*Civ\.\s*P\.\b/i,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate the quality of a procedure/jurisdiction response.
 *
 * @param response - The assistant response to evaluate
 * @param expectedJurisdiction - Optional expected state/county for validation
 * @returns Array of eval scores across procedure dimensions
 */
export function evaluateProcedure(
    response: NexxAssistantResponse,
    expectedJurisdiction?: string,
): EvalScore[] {
    const scores: EvalScore[] = [];
    const text = response.message;

    // 1. Jurisdiction specificity — mentions state/county/court
    const jurisdictionHits = JURISDICTION_MARKERS.filter((p) => p.test(text)).length;
    scores.push({
        dimension: 'procedure_jurisdiction',
        score: Math.min(1, jurisdictionHits / 2),
        notes: `Found ${jurisdictionHits} jurisdiction reference(s)`,
    });

    // 2. Correct jurisdiction — if expected, does it match?
    if (expectedJurisdiction) {
        const mentionsExpected = new RegExp(`\\b${expectedJurisdiction}\\b`, 'i').test(text);
        scores.push({
            dimension: 'procedure_correct_jurisdiction',
            score: mentionsExpected ? 1 : 0,
            notes: mentionsExpected
                ? `Correctly references ${expectedJurisdiction}`
                : `Expected jurisdiction (${expectedJurisdiction}) not mentioned`,
        });
    }

    // 3. Deadline awareness — mentions timing/deadline requirements
    const deadlineHits = DEADLINE_MARKERS.filter((p) => p.test(text)).length;
    scores.push({
        dimension: 'procedure_deadline_awareness',
        score: Math.min(1, deadlineHits / 2),
        notes: `Found ${deadlineHits} deadline/timing reference(s)`,
    });

    // 4. Statutory citation — references specific statutes or rules
    const statuteHits = STATUTE_MARKERS.filter((p) => p.test(text)).length;
    scores.push({
        dimension: 'procedure_statutory_citation',
        score: Math.min(1, statuteHits / 2),
        notes: `Found ${statuteHits} statutory reference(s)`,
    });

    // 5. Actionable steps — provides concrete filing/process steps
    const hasSteps = /\b(step\s+\d|first.*then|file.*with|submit.*to|serve.*on)\b/i.test(text);
    scores.push({
        dimension: 'procedure_actionable',
        score: hasSteps ? 1 : 0.3,
        notes: hasSteps ? 'Contains actionable procedure steps' : 'Missing concrete filing/process steps',
    });

    // 6. No fabricated statutes — check for suspicious citation patterns
    const suspiciousCitations = /\d{2,}\s+U\.S\.C\.\s+§\s+\d+|v\.\s+\w+,\s+\d+\s+\w+\.\s+\d+/i.test(text);
    scores.push({
        dimension: 'procedure_no_fabrication',
        score: suspiciousCitations ? 0 : 1,
        notes: suspiciousCitations
            ? 'WARNING: Possible fabricated citation detected'
            : 'No suspicious citations',
    });

    return scores;
}
