/**
 * Cross-module shared content bus types
 * Used by Chat, Incidents, DocuVault, Timeline, and Case Graph
 * 
 * These types ensure consistent data shapes across the entire NEXX system.
 * Import from this file — do not redefine these types elsewhere.
 */

// ---------------------------------------------------------------------------
// TimelineEvent — shared across incident logs, case graph, timeline, chat artifacts
// ---------------------------------------------------------------------------

export interface TimelineEvent {
  date: string;
  time?: string;
  description: string;
  category: string;
  source: 'incident' | 'chat' | 'document' | 'manual';
  childImpact?: string;
  evidenceType?: string[];
}

// ---------------------------------------------------------------------------
// PatternSummary — aggregated pattern from multiple incidents/events
// ---------------------------------------------------------------------------

export interface PatternSummary {
  patternType: string;       // e.g. "late_return", "communication_refusal"
  frequency: number;
  dateRange: { start: string; end: string };
  supportingEvents: string[]; // IDs or descriptions
  legalSignificance: string;
}

// ---------------------------------------------------------------------------
// DraftContent — draft content ready for DocuVault rendering
// ---------------------------------------------------------------------------

export interface DraftContent {
  sectionId: string;
  heading: string;
  body: string;
  numberedItems?: string[];
  isCourtReady: boolean;
}

// ---------------------------------------------------------------------------
// ExhibitIndex — exhibit index for evidence organization
// ---------------------------------------------------------------------------

export interface ExhibitIndex {
  exhibitLabel: string;       // e.g. "Exhibit A"
  description: string;
  sourceFile?: string;
  dateRange?: string;
  relevantIssues: string[];
}
