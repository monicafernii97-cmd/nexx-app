/**
 * Relevance Calculator — Export-path relevance scoring.
 *
 * Calculates how relevant a classified node is to each of the three
 * export paths using weighted formulas from the spec.
 *
 * Formulas:
 *   case_summary   = 0.35×fact + 0.20×issue + 0.15×risk + 0.15×argument + 0.10×timeline + 0.05×evidence
 *   court_document = 0.30×fact + 0.25×argument + 0.20×request + 0.10×procedure + 0.10×evidence + 0.05×timeline
 *   exhibit_document = 0.40×evidence + 0.25×fact + 0.15×timeline + 0.10×issue + 0.10×procedure
 */

import type { ContentScoreSet, ExportRelevanceScoreSet } from '../types/classification';

/**
 * Calculate export relevance scores for all three paths.
 *
 * Each output score is 0-1, representing how useful this content
 * is for the given export type.
 */
export function calculateExportRelevance(
    scores: ContentScoreSet,
): ExportRelevanceScoreSet {
    const caseSummary =
        0.35 * scores.fact +
        0.20 * scores.issue +
        0.15 * scores.risk +
        0.15 * scores.argument +
        0.10 * scores.timeline_event +
        0.05 * scores.evidence_reference;

    const courtDocument =
        0.30 * scores.fact +
        0.25 * scores.argument +
        0.20 * scores.request +
        0.10 * scores.procedure +
        0.10 * scores.evidence_reference +
        0.05 * scores.timeline_event;

    const exhibitDocument =
        0.40 * scores.evidence_reference +
        0.25 * scores.fact +
        0.15 * scores.timeline_event +
        0.10 * scores.issue +
        0.10 * scores.procedure;

    return {
        case_summary: clamp(caseSummary),
        court_document: clamp(courtDocument),
        exhibit_document: clamp(exhibitDocument),
    };
}

/** Clamp a value to [0, 1]. */
function clamp(value: number): number {
    return Math.max(0, Math.min(1, value));
}
