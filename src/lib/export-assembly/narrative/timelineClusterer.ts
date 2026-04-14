/**
 * Timeline Clusterer — Groups timeline events into narrative phases.
 *
 * Takes chronologically sorted events and assigns each event to one of
 * 6 narrative phases:
 *   background → baseline_practice → trigger_event → escalation →
 *   current_dispute → relief_connection
 *
 * Also supports issue-based and pattern-based clustering.
 *
 * TODO: Enrich phase assignment with classified node context once the
 * wiring layer provides node ↔ event linkage.
 */

import {
    NARRATIVE_PHASE_ORDER,
    type NarrativePhase,
    type PatternSection,
    type TimelineEventNode,
} from '../types/narrative';
import type { ClassifiedNode } from '../types/classification';

import { parseDateMs } from '../utils/dateUtils';

/**
 * Sort events by date ascending. Events without dates or with
 * unparseable dates go to the end.
 */
function sortByDate(events: TimelineEventNode[]): TimelineEventNode[] {
    return [...events].sort((a, b) => parseDateMs(a.date) - parseDateMs(b.date));
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

/** Escape special regex characters in a string. */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasMarkers(text: string, markers: string[]): boolean {
    return markers.some(m => {
        const pattern = new RegExp(`\\b${escapeRegex(m)}\\b`, 'i');
        return pattern.test(text);
    });
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
 *
 * TODO: Step 4 — Enrich with classified node context (_classifiedNodes
 * is accepted in the signature but not yet used; it is reserved for
 * future node ↔ event cross-referencing).
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _classifiedNodes: ClassifiedNode[],
): Map<NarrativePhase, TimelineEventNode[]> {
    const result = new Map<NarrativePhase, TimelineEventNode[]>(
        NARRATIVE_PHASE_ORDER.map(
            (phase): [NarrativePhase, TimelineEventNode[]] => [phase, []],
        ),
    );

    if (events.length === 0) return result;

    const sorted = sortByDate(events);
    const totalEvents = sorted.length;

    // Time boundaries (approximate).
    // Clamp recentBound to totalEvents - 1 so the recent-phase condition
    // (i >= recentBound) is reachable even for very small event lists.
    const earlyBound = Math.max(1, Math.floor(totalEvents * 0.2));
    const recentBound = Math.min(
        totalEvents - 1,
        Math.max(earlyBound + 1, totalEvents - Math.floor(totalEvents * 0.2)),
    );

    let triggerFound = false;

    // Event types eligible for relief_connection routing
    const RELIEF_EVENT_TYPES: Set<string> = new Set([
        'filing', 'incident', 'agreement', 'communication', 'other',
    ]);

    for (let i = 0; i < sorted.length; i++) {
        const event = sorted[i];
        const combined = `${event.title} ${event.description}`;

        // Precompute marker flags once per event to avoid repeated scanning
        const hasRelief = hasMarkers(combined, RELIEF_MARKERS);
        const hasStability = hasMarkers(combined, STABILITY_MARKERS);
        const hasChange = hasMarkers(combined, CHANGE_MARKERS);
        const hasConflict = hasMarkers(combined, CONFLICT_MARKERS);

        // Relief events go to relief_connection regardless of timeline position.
        if (hasRelief && RELIEF_EVENT_TYPES.has(event.type)) {
            result.get('relief_connection')!.push(event);
            continue;
        }

        // Early events: route to background/baseline only if they don't
        // carry change or conflict markers. Events with change/conflict
        // signals fall through to the trigger/escalation handlers below.
        if (i < earlyBound && !hasChange && !hasConflict) {
            if (hasStability) {
                result.get('baseline_practice')!.push(event);
            } else {
                result.get('background')!.push(event);
            }
            continue;
        }

        // Look for trigger event: first event with change markers after baseline
        if (!triggerFound && hasChange) {
            result.get('trigger_event')!.push(event);
            triggerFound = true;
            continue;
        }

        // Recent events with conflict → current_dispute
        if (i >= recentBound && hasConflict) {
            result.get('current_dispute')!.push(event);
            continue;
        }

        // Middle events with conflict → escalation (even before trigger found,
        // so the fallback trigger scan can inspect them)
        if (hasConflict) {
            result.get('escalation')!.push(event);
            continue;
        }

        // Middle events with stability → still baseline_practice
        if (hasStability) {
            result.get('baseline_practice')!.push(event);
            continue;
        }

        // Recent events without specific markers → current_dispute if recent
        if (i >= recentBound) {
            result.get('current_dispute')!.push(event);
            continue;
        }

        // Default: background
        result.get('background')!.push(event);
    }

    // If no trigger was found, promote the first conflict/change event
    // from escalation or current_dispute — validate markers to avoid
    // promoting unmarked events.
    if (!triggerFound) {
        const fallbackMarkers = [...CHANGE_MARKERS, ...CONFLICT_MARKERS];
        for (const phase of ['escalation', 'current_dispute'] as const) {
            const phaseEvents = result.get(phase);
            if (phaseEvents && phaseEvents.length > 0) {
                const idx = phaseEvents.findIndex(e =>
                    hasMarkers(`${e.title} ${e.description}`, fallbackMarkers),
                );
                if (idx >= 0) {
                    const [trigger] = phaseEvents.splice(idx, 1);
                    result.get('trigger_event')!.push(trigger);
                    break;
                }
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
    for (const [key, clusterEvents] of clusters) {
        clusters.set(key, sortByDate(clusterEvents));
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
