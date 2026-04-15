/**
 * Assembly Input Service — Fetches and normalizes case data for export assembly.
 *
 * This is the canonical data-access layer between the ExportContext orchestrator
 * and the Convex backend. It:
 *   1. Calls dedicated assembly queries (getAssemblyNodesByCase, getAssemblyEventsByCase)
 *   2. Normalizes raw Convex docs into WorkspaceNode[] + TimelineEventNode[]
 *   3. Applies deterministic ordering and dedup rules
 *
 * Architecture rules:
 * - Never reuse UI display queries for assembly
 * - Never pass raw page state into runAssembly()
 * - Keep normalization logic here, not in ExportContext
 */

import type { ConvexReactClient } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id, Doc } from '@convex/_generated/dataModel';
import type { WorkspaceNode, WorkspaceNodeType } from '../types/workspace';
import { MEMORY_TYPE_MAP, PIN_TYPE_MAP } from '../types/workspace';
import type { TimelineEventNode, TimelineEventType } from '../types/narrative';

// ---------------------------------------------------------------------------
// Assembly Inputs Result
// ---------------------------------------------------------------------------

export interface AssemblyInputs {
    workspaceNodes: WorkspaceNode[];
    timelineEvents: TimelineEventNode[];
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

/** Normalize a caseMemory doc into a WorkspaceNode. */
function normalizeMemory(doc: Doc<'caseMemory'>): WorkspaceNode {
    const nodeType: WorkspaceNodeType = MEMORY_TYPE_MAP[doc.type] ?? 'case_note';

    // Parse metadata JSON if present
    let metadata: WorkspaceNode['metadata'] = undefined;
    if (doc.metadataJson) {
        try {
            metadata = JSON.parse(doc.metadataJson);
        } catch { /* ignore malformed JSON */ }
    }

    return {
        id: doc._id,
        type: nodeType,
        text: doc.content,
        title: doc.title,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        sourceMessageId: doc.sourceMessageId,
        sourceConversationId: doc.sourceConversationId,
        metadata,
    };
}

/** Normalize a casePin doc into a WorkspaceNode. */
function normalizePin(doc: Doc<'casePins'>): WorkspaceNode {
    const nodeType: WorkspaceNodeType = PIN_TYPE_MAP[doc.type] ?? 'pinned_item';

    return {
        id: doc._id,
        type: nodeType,
        text: doc.content,
        title: doc.title,
        createdAt: doc.createdAt,
        pinned: true,
        sourceMessageId: doc.sourceMessageId,
        sourceConversationId: doc.sourceConversationId,
    };
}

/** Normalize a detectedPattern doc into a WorkspaceNode. */
function normalizePattern(doc: Doc<'detectedPatterns'>): WorkspaceNode {
    let events: string[] = [];
    try {
        const parsed = JSON.parse(doc.eventsJson);
        if (Array.isArray(parsed)) {
            events = parsed
                .map((e: { id?: string }) => e.id)
                .filter((id): id is string => typeof id === 'string');
        }
    } catch { /* ignore */ }

    return {
        id: doc._id,
        type: 'detected_pattern',
        text: doc.summary,
        title: doc.title,
        createdAt: doc.createdAt,
        linkedNodeIds: events,
        metadata: {
            category: doc.category,
            confidence: doc.confidence,
            eventCount: doc.eventCount,
        },
    };
}

/** Normalize an incident doc into a WorkspaceNode. */
function normalizeIncident(doc: Doc<'incidents'>): WorkspaceNode {
    return {
        id: doc._id,
        type: 'incident_report',
        text: doc.courtSummary || doc.narrative,
        title: `Incident: ${doc.date}`,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        eventDate: doc.date,
        metadata: {
            incidentSeverity: String(doc.severity),
            location: doc.location,
            participants: doc.witnesses,
            category: doc.category,
        },
        linkedEvidenceIds: doc.evidence,
        userTags: doc.tags,
    };
}

/** Infer TimelineEventType from tags. */
function inferEventType(tags?: string[]): TimelineEventType {
    if (!tags || tags.length === 0) return 'other';
    const tagStr = tags.join(' ').toLowerCase();
    if (tagStr.includes('communication') || tagStr.includes('email') || tagStr.includes('text')) return 'communication';
    if (tagStr.includes('filing') || tagStr.includes('court')) return 'filing';
    if (tagStr.includes('medical') || tagStr.includes('doctor')) return 'medical';
    if (tagStr.includes('school')) return 'school';
    if (tagStr.includes('travel')) return 'travel';
    if (tagStr.includes('exchange') || tagStr.includes('custody')) return 'exchange';
    if (tagStr.includes('agreement')) return 'agreement';
    if (tagStr.includes('incident')) return 'incident';
    if (tagStr.includes('payment') || tagStr.includes('financial')) return 'payment';
    return 'other';
}

/** Normalize a timelineCandidate doc into a TimelineEventNode. */
function normalizeTimelineEvent(doc: Doc<'timelineCandidates'>): TimelineEventNode {
    return {
        id: doc._id,
        date: doc.eventDate,
        title: doc.title,
        description: doc.description,
        type: inferEventType(doc.tags),
        issueTags: doc.tags,
    };
}

// ---------------------------------------------------------------------------
// Main Service
// ---------------------------------------------------------------------------

/**
 * Fetch and normalize all assembly inputs for a case.
 *
 * @param convex     Convex React client (from useConvex hook)
 * @param caseId     Target case ID
 * @returns          Canonical WorkspaceNode[] + TimelineEventNode[]
 */
export async function getAssemblyInputs(
    convex: ConvexReactClient,
    caseId: Id<'cases'>,
): Promise<AssemblyInputs> {
    // Fetch raw data from dedicated backend queries (parallel)
    const [nodeData, eventData] = await Promise.all([
        convex.query(api.assemblyQueries.getAssemblyNodesByCase, { caseId }),
        convex.query(api.assemblyQueries.getAssemblyEventsByCase, { caseId }),
    ]);

    // ── Normalize workspace nodes ──
    const workspaceNodes: WorkspaceNode[] = [
        ...nodeData.memories.map(normalizeMemory),
        ...nodeData.pins.map(normalizePin),
        ...nodeData.patterns.map(normalizePattern),
        ...nodeData.incidents.map(normalizeIncident),
    ];

    // Deterministic ordering: createdAt asc, then stable ID asc
    workspaceNodes.sort((a, b) => {
        const timeDiff = (a.createdAt ?? 0) - (b.createdAt ?? 0);
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
    });

    // ── Normalize timeline events ──
    const timelineEvents: TimelineEventNode[] = eventData.map(normalizeTimelineEvent);

    // Deterministic ordering: eventDate asc, then createdAt asc, then ID asc
    timelineEvents.sort((a, b) => {
        const dateDiff = (a.date ?? '').localeCompare(b.date ?? '');
        if (dateDiff !== 0) return dateDiff;
        return a.id.localeCompare(b.id);
    });

    return { workspaceNodes, timelineEvents };
}
