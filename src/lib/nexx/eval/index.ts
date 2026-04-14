/**
 * Eval Harness — unified runner for all per-subsystem evaluations.
 *
 * Replaces the single generic evaluateResponse() with subsystem-specific
 * evaluators that test routing accuracy, drafting quality, analysis balance,
 * support warmth, and procedure correctness.
 *
 * Usage:
 *   const results = runAllEvals(response, { expectedMode: 'court_ready_drafting' });
 *   console.log(results.overall, results.bySubsystem);
 */

import type { NexxAssistantResponse } from '../../types';
import type { EvalScore } from './router-eval';
import { evaluateRouting } from './router-eval';
import { evaluateDrafting } from './drafting-eval';
import { evaluateAnalysis } from './analysis-eval';
import { evaluateSupport } from './support-eval';
import { evaluateProcedure } from './procedure-eval';

// Re-export EvalScore for consumers
export type { EvalScore } from './router-eval';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Context for running evaluations — tells the harness what to expect. */
export interface EvalContext {
    /** The mode the router should have selected */
    expectedMode: string;
    /** Expected jurisdiction for procedure eval (optional) */
    expectedJurisdiction?: string;
}

/** Results from a single subsystem evaluation. */
export interface SubsystemResult {
    subsystem: string;
    scores: EvalScore[];
    average: number;
}

/** Complete evaluation result from all subsystems. */
export interface EvalResult {
    /** Overall quality score (0–1, average of all individual dimension scores) */
    overall: number;
    /** Per-subsystem results */
    bySubsystem: SubsystemResult[];
    /** Flat list of all individual scores */
    allScores: EvalScore[];
    /** Total number of dimensions evaluated */
    dimensionCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Calculate the average score from an array of eval scores. */
function averageScore(scores: EvalScore[]): number {
    if (scores.length === 0) return 0;
    return scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
}

/**
 * Determine which subsystem evaluators to run based on the expected mode.
 * Router eval always runs. Others run based on mode alignment.
 */
function selectEvaluators(
    mode: string,
): Array<{ subsystem: string; run: (r: NexxAssistantResponse, ctx: EvalContext) => EvalScore[] }> {
    const evaluators: Array<{
        subsystem: string;
        run: (r: NexxAssistantResponse, ctx: EvalContext) => EvalScore[];
    }> = [
        {
            subsystem: 'routing',
            run: (r, ctx) => evaluateRouting(r, ctx.expectedMode),
        },
    ];

    // Mode-specific evaluators
    if (mode === 'court_ready_drafting') {
        evaluators.push({
            subsystem: 'drafting',
            run: (r) => evaluateDrafting(r),
        });
    }

    if (['judge_lens_strategy', 'pattern_analysis', 'document_analysis'].includes(mode)) {
        evaluators.push({
            subsystem: 'analysis',
            run: (r) => evaluateAnalysis(r),
        });
    }

    if (mode === 'support_grounding') {
        evaluators.push({
            subsystem: 'support',
            run: (r) => evaluateSupport(r),
        });
    }

    if (mode === 'local_procedure') {
        evaluators.push({
            subsystem: 'procedure',
            run: (r, ctx) => evaluateProcedure(r, ctx.expectedJurisdiction),
        });
    }

    return evaluators;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all applicable evaluations for a given response and context.
 *
 * The router eval always runs. Additional subsystem evals run based
 * on the expected mode. For example, a court_ready_drafting response
 * will be evaluated by both router-eval and drafting-eval.
 *
 * @param response - The assistant response to evaluate
 * @param context - Evaluation context (expected mode, jurisdiction, etc.)
 * @returns Complete evaluation result with overall score and per-subsystem breakdown
 */
export function runAllEvals(
    response: NexxAssistantResponse,
    context: EvalContext,
): EvalResult {
    const evaluators = selectEvaluators(context.expectedMode);
    const subsystemResults: SubsystemResult[] = [];
    const allScores: EvalScore[] = [];

    for (const evaluator of evaluators) {
        const scores = evaluator.run(response, context);
        allScores.push(...scores);
        subsystemResults.push({
            subsystem: evaluator.subsystem,
            scores,
            average: averageScore(scores),
        });
    }

    return {
        overall: averageScore(allScores),
        bySubsystem: subsystemResults,
        allScores,
        dimensionCount: allScores.length,
    };
}

/**
 * Calculate a single overall quality score from individual eval dimensions.
 * Convenience function for backward compatibility with the original eval.ts.
 */
export function overallScore(scores: EvalScore[]): number {
    return averageScore(scores);
}
