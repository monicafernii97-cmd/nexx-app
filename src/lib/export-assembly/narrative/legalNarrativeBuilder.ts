/**
 * Legal Narrative Builder — Orchestrates the full narrative transformation.
 *
 * Pipeline:
 * 1. clusterTimelineEvents() → chronology phases
 * 2. detectNarrativePatterns() → pattern sections
 * 3. Identify turning points → first notable change + why it matters
 * 4. Build issue summaries → one per detected issue cluster
 * 5. mapIssuesToRelief() → relief connections
 * 6. Assemble into LegalNarrative
 *
 * Auto-detects from timeline:
 * - Baseline: What was the prior normal arrangement?
 * - Trigger: What changed?
 * - Escalation: What recurring behavior followed?
 * - Impact: Why does this matter (child/family)?
 * - Relief: What order/request logically follows?
 */

import type { ClassifiedNode } from '../types/classification';
import type {
    TimelineEventNode,
    LegalNarrative,
    NarrativeSection,
    TurningPoint,
    NarrativePhase,
} from '../types/narrative';
import { NARRATIVE_PHASE_ORDER } from '../types/narrative';
import { clusterTimelineEvents } from './timelineClusterer';
import { detectNarrativePatterns } from './patternDetector';
import { mapIssuesToRelief } from './reliefMapper';

// ---------------------------------------------------------------------------
// Phase → Narrative Section Builders
// ---------------------------------------------------------------------------

/** Map narrative phases to human-readable headings. */
const PHASE_HEADINGS: Record<NarrativePhase, string> = {
    background: 'Background',
    baseline_practice: 'Prior Established Practice',
    trigger_event: 'Change in Circumstances',
    escalation: 'Escalation of Conflict',
    current_dispute: 'Current Dispute',
    relief_connection: 'Basis for Requested Relief',
};

/**
 * Build a NarrativeSection from a set of events in a given phase.
 */
function buildPhaseSection(
    phase: NarrativePhase,
    events: TimelineEventNode[],
    sectionIndex: number,
): NarrativeSection | null {
    if (events.length === 0) return null;

    const heading = PHASE_HEADINGS[phase];

    // Build narrative text from events
    const paragraphs = events.map(event => {
        const datePrefix = event.date ? `On ${event.date}, ` : '';
        return `${datePrefix}${event.description}`;
    });

    const text = paragraphs.join(' ');

    // Collect all evidence IDs from events
    const evidenceIds: string[] = [];
    for (const event of events) {
        if (event.linkedEvidenceIds) {
            evidenceIds.push(...event.linkedEvidenceIds);
        }
    }

    // Confidence based on event count
    const confidence = Math.min(1, 0.5 + events.length * 0.1);

    return {
        id: `chronology-${sectionIndex}`,
        heading,
        text,
        supportingEventIds: events.map(e => e.id),
        supportingEvidenceIds: [...new Set(evidenceIds)],
        confidence,
    };
}

// ---------------------------------------------------------------------------
// Turning Point Detection
// ---------------------------------------------------------------------------

/**
 * Identify turning points from the clustered timeline.
 *
 * A turning point is where behavior changed, a key event occurred,
 * or a pattern shifted. Primarily comes from the trigger_event phase.
 */
function identifyTurningPoints(
    clusters: Map<NarrativePhase, TimelineEventNode[]>,
    nodes: ClassifiedNode[],
): TurningPoint[] {
    const turningPoints: TurningPoint[] = [];
    let tpId = 0;

    // The trigger event(s) are always turning points
    const triggerEvents = clusters.get('trigger_event') ?? [];
    for (const event of triggerEvents) {
        // Look for nodes that discuss this event's impact
        const impactNodes = nodes.filter(n => {
            const lower = n.rawText.toLowerCase();
            return (
                lower.includes('change') ||
                lower.includes('impact') ||
                lower.includes('affect') ||
                lower.includes('result') ||
                lower.includes('consequence')
            );
        });

        const impactDescription = impactNodes.length > 0
            ? impactNodes[0].transformedText.summarySafe ?? impactNodes[0].cleanedText
            : undefined;

        turningPoints.push({
            id: `turning-point-${tpId++}`,
            title: event.title,
            date: event.date,
            summary: event.description,
            supportingEventIds: [event.id],
            whyItMatters: buildWhyItMatters(event, impactNodes),
            impactDescription,
        });
    }

    // Also check escalation events that represent significant shifts
    const escalationEvents = clusters.get('escalation') ?? [];
    // Only add the first escalation event as a turning point if it's significantly
    // different from the trigger
    if (escalationEvents.length >= 3 && triggerEvents.length > 0) {
        const firstEscalation = escalationEvents[0];
        turningPoints.push({
            id: `turning-point-${tpId++}`,
            title: `Escalation: ${firstEscalation.title}`,
            date: firstEscalation.date,
            summary: `Following the initial change, a pattern of escalation began: ${firstEscalation.description}`,
            supportingEventIds: escalationEvents.slice(0, 3).map(e => e.id),
            whyItMatters: `This marked the beginning of a recurring pattern involving ${escalationEvents.length} documented instances.`,
        });
    }

    return turningPoints;
}

/**
 * Build the "why it matters" explanation for a turning point.
 */
function buildWhyItMatters(
    event: TimelineEventNode,
    impactNodes: ClassifiedNode[],
): string {
    // If we have impact-discussing nodes, use their insight
    if (impactNodes.length > 0) {
        const topNode = impactNodes[0];
        const safeText = topNode.transformedText.summarySafe ?? topNode.cleanedText;
        return `This change matters because: ${safeText.substring(0, 200)}`;
    }

    // Default: construct from event type
    const typeReasons: Partial<Record<string, string>> = {
        communication: 'This altered the communication dynamic between parties.',
        filing: 'This introduced formal legal proceedings into the dispute.',
        incident: 'This incident created a documented record of the conflict.',
        agreement: 'This departure from agreement created uncertainty.',
        exchange: 'This disrupted the established exchange routine.',
    };

    return typeReasons[event.type] ??
        'This event marked a significant shift in the parties\' relationship dynamic.';
}

// ---------------------------------------------------------------------------
// Issue Summary Builder
// ---------------------------------------------------------------------------

/**
 * Build one NarrativeSection per unique issue detected across nodes.
 */
function buildIssueSummaries(
    nodes: ClassifiedNode[],
    events: TimelineEventNode[],
): NarrativeSection[] {
    // Collect all unique issue tags
    const allIssues = new Set<string>();
    for (const node of nodes) {
        for (const tag of node.issueTags) {
            allIssues.add(tag);
        }
    }

    const summaries: NarrativeSection[] = [];
    let sectionId = 0;

    for (const issue of allIssues) {
        const relevantNodes = nodes.filter(n => n.issueTags.includes(issue));
        if (relevantNodes.length === 0) continue;

        // Use court-safe text from the most confident node
        const sorted = [...relevantNodes].sort((a, b) => b.confidence - a.confidence);
        const topNodes = sorted.slice(0, 3);

        const text = topNodes.map(n =>
            n.transformedText.summarySafe ?? n.cleanedText,
        ).join(' ');

        const evidenceIds = topNodes
            .flatMap(n => n.provenance.linkedEvidenceIds);

        const eventIds: string[] = [];
        for (const event of events) {
            if (event.issueTags?.includes(issue)) {
                eventIds.push(event.id);
            }
        }

        summaries.push({
            id: `issue-${sectionId++}`,
            heading: formatIssueHeading(issue),
            text: text.substring(0, 500),
            supportingEventIds: eventIds,
            supportingEvidenceIds: [...new Set(evidenceIds)],
            confidence: Math.min(1, 0.5 + relevantNodes.length * 0.08),
        });
    }

    return summaries;
}

/**
 * Format an issue tag into a readable heading.
 */
function formatIssueHeading(tag: string): string {
    const headings: Record<string, string> = {
        electronic_communication: 'Electronic Communication Disputes',
        school_stability: 'School and Routine Stability',
        schedule_compliance: 'Schedule Compliance',
        travel_safety: 'Travel and Safety Concerns',
        medical_communication: 'Medical Communication',
        financial_dispute: 'Financial Disputes',
        notice_location: 'Notice and Location Requirements',
        parenting_conduct: 'Parenting Conduct Concerns',
        court_procedure: 'Court Procedure Issues',
        delay_litigation: 'Litigation Delays',
    };

    return headings[tag] ?? tag
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

// ---------------------------------------------------------------------------
// Main Orchestrator
// ---------------------------------------------------------------------------

/**
 * Build a complete LegalNarrative from timeline events and classified nodes.
 *
 * This is the core narrative intelligence layer. It:
 * 1. Clusters events into chronological phases
 * 2. Detects behavioral patterns
 * 3. Identifies turning points
 * 4. Builds issue summaries
 * 5. Maps issues to candidate relief
 */
export function buildLegalNarrative(
    events: TimelineEventNode[],
    nodes: ClassifiedNode[],
): LegalNarrative {
    // 1. Cluster timeline events into narrative phases
    const clusters = clusterTimelineEvents(events, nodes);

    // 2. Build chronology sections from phase clusters
    const chronology: NarrativeSection[] = [];
    let sectionIndex = 0;
    for (const phase of NARRATIVE_PHASE_ORDER) {
        const phaseEvents = clusters.get(phase) ?? [];
        const section = buildPhaseSection(phase, phaseEvents, sectionIndex);
        if (section) {
            chronology.push(section);
            sectionIndex++;
        }
    }

    // 3. Detect patterns
    const patternSections = detectNarrativePatterns(nodes, events);

    // 4. Identify turning points
    const turningPoints = identifyTurningPoints(clusters, nodes);

    // 5. Build issue summaries
    const issueSummaries = buildIssueSummaries(nodes, events);

    // 6. Map issues to relief
    const allIssues = [...new Set(nodes.flatMap(n => n.issueTags))];
    const reliefConnections = mapIssuesToRelief(allIssues, nodes, events);

    return {
        chronology,
        patternSections,
        turningPoints,
        issueSummaries,
        reliefConnections,
    };
}
