/**
 * Timeline Clusterer — Groups timeline events into narrative phases.
 *
 * Takes chronologically sorted events and classified nodes, then assigns
 * each event to one of 6 narrative phases:
 *   background → baseline_practice → trigger_event → escalation →
 *   current_dispute → relief_connection
 *
 * Also supports issue-based and pattern-based clustering.
 */

import type { TimelineEventNode } from '../types/narrative';
import type { NarrativePhase } from '../types/narrative';
import type { ClassifiedNode } from '../types/classification';
import type { PatternSection } from '../types/narrative';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sort events by date ascending. Events without dates go to the end.
 */
function sortByDate(events: TimelineEventNode[]): TimelineEventNode[] {
    return [...events].sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
}


// ---------------------------------------------------------------------------
// Conflict / Change Detection Heuristics
// ---------------------------------------------------------------------------

/** Keywords that suggest a change in conduct or new behavior. */
const CHANGE_MARKERS = [
    'suddenly', 'began', 'started', 'changed', 'new demand',
    'for the first time', 'no longer', 'now demands', 'reversed',
    'departed from', 'unilaterally', 'insisted', 'refused',
    'stopped', 'withdrew', 'escalated',
];

/** Keywords that suggest ongoing conflict. */
const CONFLICT_MARKERS = [
    'conflict', 'dispute', 'disagreement', 'violation',
    'noncompliance', 'refused', 'denied', 'ignored',
    'failed to', 'did not', 'contempt', 'enforcement',
    'repeated', 'again', 'continued', 'ongoing',
];

/** Keywords that suggest stable/routine behavior. */
const STABILITY_MARKERS = [
    'routine', 'practice', 'arrangement', 'agreement',
    'historically', 'for years', 'longstanding', 'consistent',
    'established', 'mutual', 'informal', 'worked well',
    'cooperative', 'flexible',
];

/** Keywords that suggest relief-related action. */
const RELIEF_MARKERS = [
    'request', 'motion', 'petition', 'seeks', 'asks',
    'modification', 'enforcement', 'temporary order',
    'proposed', 'hearing', 'filed',
];

function hasMarkers(text: string, markers: string[]): boolean {
    const lower = text.toLowerCase();
    return markers.some(m => lower.includes(m));
}


// ---------------------------------------------------------------------------
// Phase Assignment
// ---------------------------------------------------------------------------

/**
 * Cluster timeline events into the 6 narrative phases.
 *
 * Algorithm:
 * 1. Sort all events by date
 * 2. Divide into time segments (early, middle, recent)
 * 3. Use keyword heuristics to assign phases
 * 4. Enrich with classified node context
 *
 * Phase rules:
 * - background:         Earliest 20% OR events with stability markers and no conflict
 * - baseline_practice:  Events with stability markers in early-to-mid range
 * - trigger_event:      First event with change markers after baseline period
 * - escalation:         Events with conflict markers after the trigger
 * - current_dispute:    Most recent 20% with conflict markers
 * - relief_connection:  Events with relief markers (filings, motions, requests)
 */
export function clusterTimelineEvents(
    events: TimelineEventNode[],
    classifiedNodes: ClassifiedNode[],
): Map<NarrativePhase, TimelineEventNode[]> {
    const result = new Map<NarrativePhase, TimelineEventNode[]>([
        ['background', []],
        ['baseline_practice', []],
        ['trigger_event', []],
        ['escalation', []],
        ['current_dispute', []],
        ['relief_connection', []],
    ]);

    if (events.length === 0) return result;

    const sorted = sortByDate(events);
    const totalEvents = sorted.length;

    // Time boundaries (approximate)
    const earlyBound = Math.max(1, Math.floor(totalEvents * 0.2));
    const recentBound = Math.max(earlyBound + 1, totalEvents - Math.floor(totalEvents * 0.2));

    let triggerFound = false;

    // Build a set of node issues for context enrichment
    const nodeIssueMap = new Map<string, string[]>();
    for (const node of classifiedNodes) {
        nodeIssueMap.set(node.nodeId, node.issueTags);
    }

    for (let i = 0; i < sorted.length; i++) {
        const event = sorted[i];
        const combined = `${event.title} ${event.description}`;

        // Relief events always go to relief_connection regardless of position
        if (hasMarkers(combined, RELIEF_MARKERS) && event.type === 'filing') {
            result.get('relief_connection')!.push(event);
            continue;
        }

        // Early events with no conflict → background or baseline
        if (i < earlyBound) {
            if (hasMarkers(combined, STABILITY_MARKERS)) {
                result.get('baseline_practice')!.push(event);
            } else {
                result.get('background')!.push(event);
            }
            continue;
        }

        // Look for trigger event: first event with change markers after baseline
        if (!triggerFound && hasMarkers(combined, CHANGE_MARKERS)) {
            result.get('trigger_event')!.push(event);
            triggerFound = true;
            continue;
        }

        // Recent events with conflict → current_dispute
        if (i >= recentBound && hasMarkers(combined, CONFLICT_MARKERS)) {
            result.get('current_dispute')!.push(event);
            continue;
        }

        // Middle events with conflict after trigger → escalation
        if (triggerFound && hasMarkers(combined, CONFLICT_MARKERS)) {
            result.get('escalation')!.push(event);
            continue;
        }

        // Middle events with stability → still baseline_practice
        if (hasMarkers(combined, STABILITY_MARKERS)) {
            result.get('baseline_practice')!.push(event);
            continue;
        }

        // Recent events without specific markers → current_dispute if recent
        if (i >= recentBound) {
            result.get('current_dispute')!.push(event);
            continue;
        }

        // Default: background for early, escalation for middle post-trigger
        if (triggerFound) {
            result.get('escalation')!.push(event);
        } else {
            result.get('background')!.push(event);
        }
    }

    // If no trigger was found, promote the first conflict event
    if (!triggerFound) {
        for (const phase of ['escalation', 'current_dispute'] as const) {
            const events = result.get(phase);
            if (events && events.length > 0) {
                const trigger = events.shift()!;
                result.get('trigger_event')!.push(trigger);
                break;
            }
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Issue-Based Clustering
// ---------------------------------------------------------------------------

/**
 * Cluster events by issue tag.
 *
 * Groups events by their issueTags, creating one cluster per issue.
 * Events with no issue tags go into an "untagged" group.
 */
export function clusterByIssue(
    events: TimelineEventNode[],
): Map<string, TimelineEventNode[]> {
    const clusters = new Map<string, TimelineEventNode[]>();

    for (const event of events) {
        const tags = event.issueTags ?? [];
        if (tags.length === 0) {
            const existing = clusters.get('untagged') ?? [];
            existing.push(event);
            clusters.set('untagged', existing);
        } else {
            for (const tag of tags) {
                const existing = clusters.get(tag) ?? [];
                existing.push(event);
                clusters.set(tag, existing);
            }
        }
    }

    // Sort each cluster by date
    for (const [key, events] of clusters) {
        clusters.set(key, sortByDate(events));
    }

    return clusters;
}

// ---------------------------------------------------------------------------
// Pattern-Based Clustering
// ---------------------------------------------------------------------------

/**
 * Cluster events by associated pattern.
 *
 * Groups events that support each detected pattern.
 */
export function clusterByPattern(
    events: TimelineEventNode[],
    patterns: PatternSection[],
): Map<string, TimelineEventNode[]> {
    const clusters = new Map<string, TimelineEventNode[]>();
    const eventMap = new Map(events.map(e => [e.id, e]));

    for (const pattern of patterns) {
        const supporting: TimelineEventNode[] = [];
        for (const eventId of pattern.supportingEventIds) {
            const event = eventMap.get(eventId);
            if (event) supporting.push(event);
        }
        clusters.set(pattern.patternName, sortByDate(supporting));
    }

    return clusters;
}
