/**
 * Pattern Detector — Behavioral pattern detection from classified nodes.
 *
 * Detects these specific patterns from workspace content:
 * 1. Longstanding flexibility
 * 2. Later reversion to strict enforcement
 * 3. Repeated noncompliance allegations
 * 4. Disputes over interpretation
 * 5. Routine disruption
 * 6. Delay tactics
 * 7. Increasing procedural friction
 * 8. Attempts to expand order text
 *
 * Extends the existing premiumAnalytics.ts pattern detection but operates
 * on pre-classified ClassifiedNode data rather than raw timeline entries.
 */

import type { ClassifiedNode } from '../types/classification';
import type { TimelineEventNode, PatternSection } from '../types/narrative';

// ---------------------------------------------------------------------------
// Pattern Definitions
// ---------------------------------------------------------------------------

interface PatternRule {
    id: string;
    name: string;
    /** Minimum number of supporting nodes/events required */
    minSupport: number;
    /** Keywords that indicate this pattern in node text */
    nodeMarkers: string[];
    /** Keywords that indicate this pattern in timeline events */
    eventMarkers: string[];
    /** Issue tags that correlate with this pattern */
    relatedIssueTags: string[];
    /** Pattern tags that directly match */
    patternTags: string[];
}

const PATTERN_RULES: PatternRule[] = [
    {
        id: 'flexibility_history',
        name: 'Longstanding Flexibility',
        minSupport: 3,
        nodeMarkers: [
            'historically flexible', 'prior practice', 'informally agreed',
            'have always', 'we used to', 'for years', 'longstanding',
            'established practice', 'mutual understanding', 'worked well',
            'cooperative', 'accommodated',
        ],
        eventMarkers: [
            'agreement', 'arranged', 'flexible', 'accommodated',
            'informal', 'cooperative', 'worked out',
        ],
        relatedIssueTags: ['schedule_compliance'],
        patternTags: ['flexibility_history'],
    },
    {
        id: 'flexibility_reversion',
        name: 'Reversion to Strict Enforcement',
        minSupport: 3,
        nodeMarkers: [
            'now demands', 'suddenly', 'changed position', 'reversed',
            'no longer willing', 'strict enforcement', 'insists on',
            'new demand', 'departed from', 'unilaterally',
            'strict reading', 'letter of the order',
        ],
        eventMarkers: [
            'demanded', 'insisted', 'refused', 'denied',
            'reverted', 'strict', 'enforcement',
        ],
        relatedIssueTags: ['schedule_compliance'],
        patternTags: ['flexibility_reversion'],
    },
    {
        id: 'noncompliance_allegations',
        name: 'Repeated Noncompliance Allegations',
        minSupport: 3,
        nodeMarkers: [
            'violation', 'noncompliance', 'failed to comply', 'in contempt',
            'did not follow', 'ignored the order', 'disregard',
            'breach', 'defied', 'refused to follow',
        ],
        eventMarkers: [
            'violation', 'contempt', 'noncompliance', 'breach',
            'enforcement', 'failed',
        ],
        relatedIssueTags: ['schedule_compliance', 'court_procedure'],
        patternTags: ['noncompliance_allegations'],
    },
    {
        id: 'interpretation_dispute',
        name: 'Interpretation Disputes',
        minSupport: 2,
        nodeMarkers: [
            'interpretation', 'ambiguous', 'unclear', 'vague',
            'reading of the order', 'meaning of', 'construed',
            'different understanding', 'does not say', 'order states',
            'plain language',
        ],
        eventMarkers: [
            'interpretation', 'ambiguous', 'dispute', 'meaning',
            'clarification',
        ],
        relatedIssueTags: ['schedule_compliance'],
        patternTags: ['interpretation_dispute'],
    },
    {
        id: 'routine_disruption',
        name: 'Routine Disruption',
        minSupport: 3,
        nodeMarkers: [
            'routine disrupted', 'disrupts routine', 'inconsistent schedule',
            'confusion', 'instability', 'unpredictable', 'last minute',
            'no notice', 'surprise', 'uprooted', 'interfered with',
            'school night', 'bedtime', 'homework',
        ],
        eventMarkers: [
            'disrupted', 'canceled', 'cancelled', 'last minute',
            'surprise', 'no notice', 'changed', 'rescheduled',
        ],
        relatedIssueTags: ['school_stability', 'schedule_compliance'],
        patternTags: ['routine_disruption'],
    },
    {
        id: 'delay_tactics',
        name: 'Delay Tactics',
        minSupport: 3,
        nodeMarkers: [
            'delay', 'postpone', 'stalled', 'dragged out',
            'non-responsive', 'ignored requests', 'failed to respond',
            'slow-walked', 'continuance', 'reset',
            'missed deadline', 'extension after extension',
        ],
        eventMarkers: [
            'delay', 'postponed', 'continued', 'reset',
            'rescheduled', 'extension', 'no response',
        ],
        relatedIssueTags: ['delay_litigation', 'court_procedure'],
        patternTags: ['delay_tactics'],
    },
    {
        id: 'procedural_friction',
        name: 'Increasing Procedural Friction',
        minSupport: 2,
        nodeMarkers: [
            'procedural', 'technical objection', 'improper service',
            'defective notice', 'filing error', 'administrative',
            'clerical', 'jurisdictional', 'challenge',
            'motion to strike', 'motion to dismiss',
        ],
        eventMarkers: [
            'objection', 'challenge', 'strike', 'dismiss',
            'procedural', 'technical',
        ],
        relatedIssueTags: ['court_procedure', 'delay_litigation'],
        patternTags: ['procedural_friction'],
    },
    {
        id: 'expansion_attempt',
        name: 'Attempts to Expand Order Text',
        minSupport: 2,
        nodeMarkers: [
            'expand', 'additional', 'more time', 'increase',
            'beyond what the order', 'not in the order',
            'exceeds', 'overstep', 'extra requirements',
            'adding conditions', 'new restriction',
        ],
        eventMarkers: [
            'expand', 'additional', 'increase', 'extra',
            'new requirement', 'condition',
        ],
        relatedIssueTags: ['schedule_compliance'],
        patternTags: ['expansion_attempt'],
    },
];

// ---------------------------------------------------------------------------
// Pattern Detection
// ---------------------------------------------------------------------------

/**
 * Detect narrative patterns from classified workspace nodes and timeline events.
 *
 * For each pattern rule, counts supporting evidence from both nodes and events.
 * Only patterns meeting the minimum support threshold are returned.
 */
export function detectNarrativePatterns(
    nodes: ClassifiedNode[],
    events: TimelineEventNode[],
): PatternSection[] {
    const detected: PatternSection[] = [];

    for (const rule of PATTERN_RULES) {
        const supportingEventIds: string[] = [];
        const supportingEvidenceIds: string[] = [];
        const matchedIssueTags: string[] = [];
        let totalSupport = 0;

        // Check nodes for pattern markers
        for (const node of nodes) {
            const lower = node.rawText.toLowerCase();
            const markerHits = rule.nodeMarkers.filter(m => lower.includes(m)).length;

            // Also check if node has matching pattern tags
            const patternTagMatch = node.patternTags.some(
                t => rule.patternTags.includes(t),
            );

            // Check if node has related issue tags
            const issueTagMatch = node.issueTags.some(
                t => rule.relatedIssueTags.includes(t),
            );

            if (markerHits >= 2 || patternTagMatch) {
                totalSupport++;
                // Collect evidence IDs from supporting nodes
                for (const eid of node.provenance.linkedEvidenceIds) {
                    supportingEvidenceIds.push(eid);
                }
            }

            if (issueTagMatch) {
                for (const tag of node.issueTags) {
                    if (rule.relatedIssueTags.includes(tag)) {
                        matchedIssueTags.push(tag);
                    }
                }
            }
        }

        // Check timeline events for pattern markers
        for (const event of events) {
            const combined = `${event.title} ${event.description}`.toLowerCase();
            const markerHits = rule.eventMarkers.filter(m => combined.includes(m)).length;

            if (markerHits >= 1) {
                totalSupport++;
                supportingEventIds.push(event.id);
                if (event.linkedEvidenceIds) {
                    supportingEvidenceIds.push(...event.linkedEvidenceIds);
                }
            }
        }

        // Only emit patterns that meet minimum support threshold
        if (totalSupport >= rule.minSupport) {
            // Calculate confidence based on support strength
            const confidence = Math.min(1, 0.5 + (totalSupport - rule.minSupport) * 0.1);

            detected.push({
                id: rule.id,
                patternName: rule.name,
                summary: buildPatternSummary(rule, totalSupport),
                supportingEventIds: [...new Set(supportingEventIds)],
                supportingEvidenceIds: [...new Set(supportingEvidenceIds)],
                issueTags: [...new Set(matchedIssueTags)],
                confidence,
            });
        }
    }

    return detected;
}

/**
 * Build a human-readable summary for a detected pattern.
 */
function buildPatternSummary(rule: PatternRule, supportCount: number): string {
    const summaries: Record<string, string> = {
        flexibility_history:
            `Evidence of a longstanding flexible arrangement between parties, supported by ${supportCount} data points.`,
        flexibility_reversion:
            `Evidence of a departure from previously established flexible practices, with one party reverting to strict enforcement of order language. Supported by ${supportCount} data points.`,
        noncompliance_allegations:
            `Repeated allegations of noncompliance with court orders, documented across ${supportCount} instances.`,
        interpretation_dispute:
            `Ongoing disputes over interpretation of order language, with parties disagreeing on meaning or scope. Supported by ${supportCount} data points.`,
        routine_disruption:
            `Pattern of conduct disrupting established routines, affecting scheduling stability. Documented across ${supportCount} instances.`,
        delay_tactics:
            `Pattern of procedural delays and non-responsiveness, creating friction in resolution. Supported by ${supportCount} data points.`,
        procedural_friction:
            `Increasing use of procedural objections or technical challenges. Supported by ${supportCount} data points.`,
        expansion_attempt:
            `Attempts to impose requirements or conditions beyond what is expressly stated in the current order. Supported by ${supportCount} data points.`,
    };

    return summaries[rule.id] ?? `Pattern "${rule.name}" detected with ${supportCount} supporting data points.`;
}
