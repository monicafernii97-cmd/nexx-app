/**
 * UI Intelligence — Complete Type System
 *
 * Defines all types for the adaptive panel rendering system,
 * contextual actions, save classifications, and case workspace.
 */

// ---------------------------------------------------------------------------
// Response Intent — determines which panels and actions are shown
// ---------------------------------------------------------------------------

export type ResponseIntent =
  | 'support'
  | 'analysis'
  | 'strategy'
  | 'drafting'
  | 'incident'
  | 'procedure'
  | 'evidence'
  | 'mixed';

// ---------------------------------------------------------------------------
// Panel Types — 47 unique panel types across 8 categories
// ---------------------------------------------------------------------------

// Foundational (7)
export type FoundationalPanel =
  | 'overview'
  | 'key_takeaway'
  | 'what_this_means'
  | 'why_it_matters'
  | 'strongest_framing'
  | 'weakest_point'
  | 'what_to_watch';

// Strategic (9)
export type StrategicPanel =
  | 'judge_lens'
  | 'risk_concern'
  | 'strength_highlight'
  | 'good_faith_positioning'
  | 'cooperation_signal'
  | 'reasonableness_check'
  | 'credibility_impact'
  | 'bad_faith_risk'
  | 'strategic_reframe';

// Action-Oriented (6)
export type ActionOrientedPanel =
  | 'best_next_steps'
  | 'options_paths'
  | 'follow_up_questions'
  | 'gather_this_next'
  | 'do_now_vs_later'
  | 'decision_guide';

// Drafting (6)
export type DraftingPanel =
  | 'suggested_reply'
  | 'court_ready_version'
  | 'alternate_version'
  | 'why_this_wording_works'
  | 'tone_adjustment'
  | 'more_neutral_version';

// Evidence / Record (6)
export type EvidencePanel =
  | 'timeline_candidate'
  | 'incident_summary'
  | 'documentation_gap'
  | 'exhibit_note'
  | 'proof_strength'
  | 'fact_vs_feeling';

// Process / Procedure (5)
export type ProcedurePanel =
  | 'procedure_notes'
  | 'local_context'
  | 'what_to_verify'
  | 'deadline_watch'
  | 'filing_considerations';

// Reflective / Support (5)
export type SupportPanel =
  | 'emotional_insight'
  | 'validation_support'
  | 'gentle_reframe'
  | 'pattern_detected'
  | 'relationship_dynamic';

// Memory / Organization (4)
export type MemoryPanel =
  | 'pinworthy_points'
  | 'save_to_case_suggestions'
  | 'related_case_context'
  | 'linked_history';

/** All 47 panel types */
export type PanelType =
  | FoundationalPanel
  | StrategicPanel
  | ActionOrientedPanel
  | DraftingPanel
  | EvidencePanel
  | ProcedurePanel
  | SupportPanel
  | MemoryPanel;

// ---------------------------------------------------------------------------
// Panel Tone
// ---------------------------------------------------------------------------

export type PanelTone = 'neutral' | 'info' | 'success' | 'warning' | 'support';

// ---------------------------------------------------------------------------
// Panel Data — what gets rendered by PanelRenderer
// ---------------------------------------------------------------------------

export interface PanelData {
  type: PanelType;
  title: string;
  content: string | string[];
  tone?: PanelTone;
  collapsible?: boolean;
}

// ---------------------------------------------------------------------------
// Save Types — 12 classifications
// ---------------------------------------------------------------------------

export type SaveType =
  | 'case_note'
  | 'key_fact'
  | 'strategy_point'
  | 'risk_concern'
  | 'strength_highlight'
  | 'good_faith_point'
  | 'draft_snippet'
  | 'hearing_prep_point'
  | 'timeline_candidate'
  | 'incident_note'
  | 'exhibit_note'
  | 'procedure_note'
  | 'question_to_verify'
  | 'pattern_analysis'
  | 'narrative_synthesis';

// ---------------------------------------------------------------------------
// Action Types — 12 actions
// ---------------------------------------------------------------------------

export type ActionType =
  | 'copy'
  | 'save_note'
  | 'pin'
  | 'save_to_case'
  | 'save_strategy'
  | 'save_good_faith'
  | 'save_draft'
  | 'add_to_timeline'
  | 'convert_to_incident'
  | 'convert_to_exhibit'
  | 'insert_into_template'
  | 'create_draft';

// ---------------------------------------------------------------------------
// Action Tier — controls visibility
// ---------------------------------------------------------------------------

export type ActionTier = 'universal' | 'medium' | 'higher';

// ---------------------------------------------------------------------------
// Save Suggestion — smart save recommendations
// ---------------------------------------------------------------------------

export interface SaveSuggestion {
  type: SaveType;
  label: string;
  recommended?: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Eligibility Flags — which higher-context actions are allowed
// ---------------------------------------------------------------------------

export interface EligibilityFlags {
  timelineEligible: boolean;
  incidentEligible: boolean;
  exhibitEligible: boolean;
  draftEligible: boolean;
  templateEligible: boolean;
}

// ---------------------------------------------------------------------------
// Response Presentation — what the renderer needs
// ---------------------------------------------------------------------------

export interface ResponsePresentation {
  intent: ResponseIntent;
  panelOrder: PanelType[];
  allowedActions: ActionType[];
  recommendedActions: ActionType[];
  saveSuggestions: SaveSuggestion[];
  eligibility: EligibilityFlags;
}

// ---------------------------------------------------------------------------
// Assistant Response View Model — full render payload
// ---------------------------------------------------------------------------

export interface AssistantResponseViewModel {
  responseId: string;
  caseId?: string;
  presentation: ResponsePresentation;
  panels: PanelData[];
}

// ---------------------------------------------------------------------------
// Case Context Chip
// ---------------------------------------------------------------------------

export interface CaseContextChip {
  label: string;
  tone?: PanelTone;
}

// ---------------------------------------------------------------------------
// Pinned Items
// ---------------------------------------------------------------------------

export type PinnableClass =
  | 'key_fact'
  | 'strategy_point'
  | 'good_faith_point'
  | 'strength_highlight'
  | 'risk_concern'
  | 'hearing_prep_point'
  | 'draft_snippet'
  | 'question_to_verify'
  | 'timeline_anchor';

export interface PinnedItem {
  id: string;
  title: string;
  type: PinnableClass;
  content: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Analysis Steps — thinking indicator
// ---------------------------------------------------------------------------

export type AnalysisStepStatus = 'complete' | 'active' | 'upcoming';

export interface AnalysisStep {
  id: string;
  label: string;
  status: AnalysisStepStatus;
}

// ---------------------------------------------------------------------------
// Risk & Strength Subtypes — granular categorization
// ---------------------------------------------------------------------------

export type RiskSubtype =
  | 'compliance'
  | 'tone'
  | 'credibility'
  | 'documentation'
  | 'reasonableness'
  | 'bad_faith_appearance';

export type StrengthSubtype =
  | 'flexibility'
  | 'cooperation'
  | 'child_centered'
  | 'documented_effort'
  | 'reasonable_alternative'
  | 'order_awareness';

// ---------------------------------------------------------------------------
// Pattern Detection
// ---------------------------------------------------------------------------

export type PatternType =
  | 'delay_tactic'
  | 'control_dispute'
  | 'documentation_gap'
  | 'routine_disruption'
  | 'notice_conflict'
  | 'credibility_sensitivity';

export interface DetectedPattern {
  type: PatternType;
  label: string;
  confidence?: number;
}

// ---------------------------------------------------------------------------
// Local Procedure
// ---------------------------------------------------------------------------

export interface LocalProcedureInfo {
  jurisdiction: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Panel Usage Event — for analytics / self-review
// ---------------------------------------------------------------------------

export type PanelInteraction =
  | 'shown'
  | 'expanded'
  | 'copied'
  | 'saved'
  | 'pinned'
  | 'converted'
  | 'dismissed';

export interface PanelUsageEvent {
  panelType: PanelType;
  interaction: PanelInteraction;
  responseId: string;
  timestamp: number;
}
