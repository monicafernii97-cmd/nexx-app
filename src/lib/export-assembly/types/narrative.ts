/**
 * Narrative Types — Timeline-to-legal-narrative transformation schemas.
 *
 * The narrative transformer converts raw timeline events into structured
 * legal story logic: chronology phases, detected patterns, turning points,
 * issue summaries, and relief connections.
 */

// ---------------------------------------------------------------------------
// Timeline Event Types
// ---------------------------------------------------------------------------

export type TimelineEventType =
    | 'communication'
    | 'filing'
    | 'medical'
    | 'school'
    | 'travel'
    | 'exchange'
    | 'agreement'
    | 'incident'
    | 'payment'
    | 'other';

/**
 * TimelineEventNode — Normalized timeline event for narrative building.
 * Created from timelineCandidates records.
 */
export interface TimelineEventNode {
    id: string;
    date: string;
    title: string;
    description: string;
    type: TimelineEventType;
    participants?: string[];
    linkedEvidenceIds?: string[];
    linkedNodeIds?: string[];
    issueTags?: string[];
}

// ---------------------------------------------------------------------------
// Narrative Phases — How timeline events cluster into story structure
// ---------------------------------------------------------------------------

/**
 * NarrativePhase — The 6 chronological phases of a legal narrative.
 *
 * Phase rules:
 * - background:         Earliest historical context
 * - baseline_practice:  Repeated stable practice over time
 * - trigger_event:      First notable change in conduct
 * - escalation:         Repeated conflict after the trigger
 * - current_dispute:    Most recent active conflict
 * - relief_connection:  Events directly supporting the requested relief
 */
export type NarrativePhase =
    | 'background'
    | 'baseline_practice'
    | 'trigger_event'
    | 'escalation'
    | 'current_dispute'
    | 'relief_connection';

/** Ordered list of narrative phases for sequential processing. */
export const NARRATIVE_PHASE_ORDER: NarrativePhase[] = [
    'background',
    'baseline_practice',
    'trigger_event',
    'escalation',
    'current_dispute',
    'relief_connection',
];

// ---------------------------------------------------------------------------
// Narrative Sections — Building blocks of the legal narrative
// ---------------------------------------------------------------------------

/** A section of the generated legal narrative. */
export interface NarrativeSection {
    id: string;
    heading: string;
    text: string;
    supportingEventIds: string[];
    supportingEvidenceIds: string[];
    confidence: number;
}

/** A detected behavioral pattern with evidence chain. */
export interface PatternSection {
    id: string;
    patternName: string;
    summary: string;
    supportingEventIds: string[];
    supportingEvidenceIds: string[];
    issueTags: string[];
    confidence: number;
}

/**
 * TurningPoint — A pivotal moment in the case narrative.
 *
 * Turning points mark where behavior changed, a key event occurred,
 * or a pattern shifted. They answer "what changed and why it matters."
 */
export interface TurningPoint {
    id: string;
    title: string;
    date?: string;
    summary: string;
    supportingEventIds: string[];
    whyItMatters: string;
    /** Explicit child/family impact description — required for family law contexts */
    impactDescription?: string;
}

/**
 * ReliefConnection — Links an issue to candidate relief with evidence.
 *
 * Each connection maps: issue → supporting events/evidence → suggested relief.
 * This is what powers the Prayer/Requested Relief sections in court documents.
 */
export interface ReliefConnection {
    id: string;
    issue: string;
    suggestedRelief: string;
    reasoning: string;
    supportingEventIds: string[];
    supportingEvidenceIds: string[];
    confidence: number;
}

// ---------------------------------------------------------------------------
// Legal Narrative — The full output of the narrative transformer
// ---------------------------------------------------------------------------

/**
 * LegalNarrative — Complete structured narrative built from timeline + classified nodes.
 *
 * This is the core output of the narrative engine. Each export mapper
 * consumes a different subset of this structure:
 * - Summary: chronology + patterns + issues + gaps
 * - Court: chronology + patterns + issues + relief (as structured caseGraph)
 * - Exhibit: chronology for grouping + issues for cover sheets
 */
export interface LegalNarrative {
    /** Chronological narrative sections (one per phase) */
    chronology: NarrativeSection[];
    /** Detected behavioral patterns with evidence chains */
    patternSections: PatternSection[];
    /** Pivotal moments in the case */
    turningPoints: TurningPoint[];
    /** One summary per detected issue cluster */
    issueSummaries: NarrativeSection[];
    /** Issue → relief connections with supporting evidence */
    reliefConnections: ReliefConnection[];
}
