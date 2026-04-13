/**
 * Analysis Eval — evaluates strategic analysis quality.
 *
 * Tests: Does the analysis include risk + strength + judge lens?
 * Validates balanced perspective, evidence anchoring, and
 * structured strategic coverage.
 */

import type { NexxAssistantResponse } from '../../types';
import type { EvalScore } from './router-eval';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate whether an analysis response provides balanced, strategic coverage.
 *
 * @param response - The assistant response to evaluate
 * @returns Array of eval scores across analysis dimensions
 */
export function evaluateAnalysis(response: NexxAssistantResponse): EvalScore[] {
    const scores: EvalScore[] = [];
    const text = response.message;

    // 1. Risk coverage — does the analysis surface risks?
    const hasRisk = /\b(risk|concern|vulnerability|weak|caution|careful|danger|exposure)\b/i.test(text);
    scores.push({
        dimension: 'analysis_risk_coverage',
        score: hasRisk ? 1 : 0.2,
        notes: hasRisk ? 'Risk/concern analysis present' : 'Missing risk coverage — analysis should surface vulnerabilities',
    });

    // 2. Strength coverage — does it balance risks with strengths?
    const hasStrength = /\b(strength|advantage|favorable|positive|strong\s+position|benefit)\b/i.test(text);
    scores.push({
        dimension: 'analysis_strength_coverage',
        score: hasStrength ? 1 : 0.2,
        notes: hasStrength ? 'Strength analysis present' : 'Missing strength coverage — analysis should be balanced',
    });

    // 3. Judge lens — does it consider how a judge might view the situation?
    const hasJudgeLens = /\b(judge|court.*view|bench|credibility|perception|appear.*to)\b/i.test(text);
    scores.push({
        dimension: 'analysis_judge_lens',
        score: hasJudgeLens ? 1 : 0.3,
        notes: hasJudgeLens ? 'Judge-perspective framing present' : 'Missing judge lens — strategic analysis should include court perspective',
    });

    // 4. Evidence anchoring — does it reference specific facts or dates?
    const dateRefs = text.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g)?.length ?? 0;
    const factRefs = /\b(documented|recorded|evidence|incident|event|on\s+\w+\s+\d{1,2})\b/i.test(text);
    const evidenceScore = Math.min(1, (dateRefs * 0.3) + (factRefs ? 0.4 : 0));
    scores.push({
        dimension: 'analysis_evidence_anchored',
        score: evidenceScore,
        notes: `${dateRefs} date reference(s), ${factRefs ? 'has' : 'no'} fact anchoring language`,
    });

    // 5. Balanced perspective — not one-sided
    const hasMultipleAngles = hasRisk && hasStrength;
    scores.push({
        dimension: 'analysis_balance',
        score: hasMultipleAngles ? 1 : 0.3,
        notes: hasMultipleAngles
            ? 'Balanced — covers both risks and strengths'
            : 'One-sided analysis — should present multiple perspectives',
    });

    // 6. Actionable recommendations — includes next steps
    const hasNextSteps = /\b(next\s+steps?|recommend|should\s+consider|action\s+items?|to\s*-?\s*do)\b/i.test(text);
    scores.push({
        dimension: 'analysis_actionable',
        score: hasNextSteps ? 1 : 0.4,
        notes: hasNextSteps ? 'Contains actionable recommendations' : 'Missing actionable next steps',
    });

    return scores;
}
