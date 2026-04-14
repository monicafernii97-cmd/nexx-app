/**
 * Workspace Node Types — Normalized data shapes for export assembly.
 *
 * Every piece of workspace data (caseMemory, casePins, timelineCandidates,
 * detectedPatterns, incidents) is normalized into a WorkspaceNode before
 * any classification, tagging, or mapping runs.
 *
 * This ensures the classification engine operates on a single, consistent
 * shape regardless of the source table.
 */

// ---------------------------------------------------------------------------
// Node Types — Maps 1:1 to Convex source data
// ---------------------------------------------------------------------------

export type WorkspaceNodeType =
    | 'narrative_block'    // caseMemory → narrative_synthesis
    | 'incident_report'    // incidents table
    | 'timeline_event'     // timelineCandidates table
    | 'evidence_item'      // casePins (exhibit-linked)
    | 'key_fact'           // caseMemory → key_fact
    | 'strategy_point'     // caseMemory → strategy_point
    | 'risk_concern'       // caseMemory → risk_concern
    | 'strength_highlight' // caseMemory → strength_highlight
    | 'draft_snippet'      // caseMemory → draft_snippet
    | 'hearing_prep'       // caseMemory → hearing_prep_point
    | 'exhibit_note'       // caseMemory → exhibit_note
    | 'procedure_note'     // caseMemory → procedure_note
    | 'detected_pattern'   // detectedPatterns table
    | 'pinned_item'        // casePins (general)
    | 'case_note'          // caseMemory → case_note
    | 'good_faith_point'   // caseMemory → good_faith_point
    | 'question_to_verify' // caseMemory → question_to_verify
    | 'pattern_analysis'   // caseMemory → pattern_analysis

// ---------------------------------------------------------------------------
// Normalized Workspace Node
// ---------------------------------------------------------------------------

export interface WorkspaceNodeMetadata {
    /** People involved in this event/item */
    participants?: string[];
    /** Physical location if relevant */
    location?: string;
    /** Hint for document type (e.g., 'motion', 'declaration') */
    documentTypeHint?: string;
    /** Court name hint */
    courtHint?: string;
    /** Filing title hint */
    filingTitleHint?: string;
    /** Exhibit label hint (e.g., 'Exhibit A') */
    exhibitLabelHint?: string;
    /** Status: 'confirmed' | 'candidate' (timeline items) */
    status?: string;
    /** Confidence level: 'medium' | 'high' (detected patterns) */
    confidence?: string;
    /** Number of events supporting a pattern */
    eventCount?: number;
    /** Behavioral category (patterns) */
    category?: string;
    /** Incident severity if applicable */
    incidentSeverity?: string;
    /** Emotional intensity rating 0-1 */
    emotionalIntensity?: number;
    /** Whether this content is confidential */
    confidential?: boolean;
}

/**
 * WorkspaceNode — The universal shape for all workspace content.
 *
 * Every source table record gets normalized into this before the
 * classification engine touches it.
 */
export interface WorkspaceNode {
    /** Unique identifier (Convex document _id) */
    id: string;
    /** Source content type */
    type: WorkspaceNodeType;
    /** Primary text content */
    text: string;
    /** Short title or heading */
    title?: string;

    // ── Timestamps ──
    createdAt?: number;
    updatedAt?: number;
    /** ISO date string for events/incidents */
    eventDate?: string;

    // ── Source Traceability ──
    author?: string;
    sourceLabel?: string;
    sourceDocumentId?: string;
    sourceMessageId?: string;
    sourceConversationId?: string;

    // ── Cross-References ──
    linkedEvidenceIds?: string[];
    linkedTimelineIds?: string[];
    linkedNodeIds?: string[];

    // ── User Annotations ──
    userTags?: string[];
    pinned?: boolean;

    // ── Extended Metadata ──
    metadata?: WorkspaceNodeMetadata;
}

// ---------------------------------------------------------------------------
// caseMemory type → WorkspaceNodeType mapping
// ---------------------------------------------------------------------------

/** Maps caseMemory `type` values to WorkspaceNodeType. */
export const MEMORY_TYPE_MAP: Record<string, WorkspaceNodeType> = {
    case_note: 'case_note',
    key_fact: 'key_fact',
    strategy_point: 'strategy_point',
    risk_concern: 'risk_concern',
    strength_highlight: 'strength_highlight',
    good_faith_point: 'good_faith_point',
    draft_snippet: 'draft_snippet',
    hearing_prep_point: 'hearing_prep',
    timeline_candidate: 'timeline_event',
    incident_note: 'incident_report',
    exhibit_note: 'exhibit_note',
    procedure_note: 'procedure_note',
    question_to_verify: 'question_to_verify',
    pattern_analysis: 'pattern_analysis',
    narrative_synthesis: 'narrative_block',
};

/** Maps casePins `type` values to WorkspaceNodeType. */
export const PIN_TYPE_MAP: Record<string, WorkspaceNodeType> = {
    key_fact: 'key_fact',
    strategy_point: 'strategy_point',
    good_faith_point: 'good_faith_point',
    strength_highlight: 'strength_highlight',
    risk_concern: 'risk_concern',
    hearing_prep_point: 'hearing_prep',
    draft_snippet: 'draft_snippet',
    question_to_verify: 'question_to_verify',
    timeline_anchor: 'timeline_event',
};
