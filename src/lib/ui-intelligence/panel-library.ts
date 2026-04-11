/**
 * Panel Library — Human-readable titles and tone assignments for all 47 panels.
 */

import type { PanelType, PanelTone } from './types';

// ---------------------------------------------------------------------------
// Panel Titles — display names for all 47 panel types
// ---------------------------------------------------------------------------

export const PANEL_TITLES: Record<PanelType, string> = {
  // Foundational (7)
  overview: 'Overview',
  key_takeaway: 'Key Takeaway',
  what_this_means: 'What This Means',
  why_it_matters: 'Why It Matters',
  strongest_framing: 'Strongest Framing',
  weakest_point: 'Weakest Point',
  what_to_watch: 'What to Watch',

  // Strategic (9)
  judge_lens: 'Judge Lens',
  risk_concern: 'Risk / Concern',
  strength_highlight: 'Strength / Highlight',
  good_faith_positioning: 'Good-Faith Positioning',
  cooperation_signal: 'Cooperation Signal',
  reasonableness_check: 'Reasonableness Check',
  credibility_impact: 'Credibility Impact',
  bad_faith_risk: 'Bad-Faith Risk',
  strategic_reframe: 'Strategic Reframe',

  // Action-Oriented (6)
  best_next_steps: 'Best Next Steps',
  options_paths: 'Options',
  follow_up_questions: 'Follow-Up Questions',
  gather_this_next: 'Gather This Next',
  do_now_vs_later: 'Do Now vs Later',
  decision_guide: 'Decision Guide',

  // Drafting (6)
  suggested_reply: 'Suggested Reply',
  court_ready_version: 'Court-Ready Version',
  alternate_version: 'Alternate Version',
  why_this_wording_works: 'Why This Wording Works',
  tone_adjustment: 'Tone Adjustment',
  more_neutral_version: 'More Neutral Version',

  // Evidence / Record (6)
  timeline_candidate: 'Timeline Candidate',
  incident_summary: 'Incident Summary',
  documentation_gap: 'Documentation Gap',
  exhibit_note: 'Exhibit Note',
  proof_strength: 'Proof Strength',
  fact_vs_feeling: 'Fact vs Feeling',

  // Process / Procedure (5)
  procedure_notes: 'Procedure Notes',
  local_context: 'Local Context',
  what_to_verify: 'What to Verify',
  deadline_watch: 'Deadline Watch',
  filing_considerations: 'Filing Considerations',

  // Reflective / Support (5)
  emotional_insight: 'Emotional Insight',
  validation_support: 'Support',
  gentle_reframe: 'Gentle Reframe',
  pattern_detected: 'Pattern Detected',
  relationship_dynamic: 'Relationship Dynamic',

  // Memory / Organization (4)
  pinworthy_points: 'Pinworthy Points',
  save_to_case_suggestions: 'Save Suggestions',
  related_case_context: 'Related Case Context',
  linked_history: 'Linked History',
};

// ---------------------------------------------------------------------------
// Panel Tones — visual treatment per panel type
// ---------------------------------------------------------------------------

export const PANEL_TONES: Record<PanelType, PanelTone> = {
  // Foundational
  overview: 'neutral',
  key_takeaway: 'neutral',
  what_this_means: 'info',
  why_it_matters: 'info',
  strongest_framing: 'success',
  weakest_point: 'warning',
  what_to_watch: 'warning',

  // Strategic
  judge_lens: 'info',
  risk_concern: 'warning',
  strength_highlight: 'success',
  good_faith_positioning: 'success',
  cooperation_signal: 'success',
  reasonableness_check: 'success',
  credibility_impact: 'info',
  bad_faith_risk: 'warning',
  strategic_reframe: 'info',

  // Action-Oriented
  best_next_steps: 'neutral',
  options_paths: 'neutral',
  follow_up_questions: 'info',
  gather_this_next: 'info',
  do_now_vs_later: 'neutral',
  decision_guide: 'neutral',

  // Drafting
  suggested_reply: 'neutral',
  court_ready_version: 'neutral',
  alternate_version: 'neutral',
  why_this_wording_works: 'info',
  tone_adjustment: 'info',
  more_neutral_version: 'neutral',

  // Evidence / Record
  timeline_candidate: 'info',
  incident_summary: 'warning',
  documentation_gap: 'warning',
  exhibit_note: 'info',
  proof_strength: 'success',
  fact_vs_feeling: 'info',

  // Process / Procedure
  procedure_notes: 'info',
  local_context: 'info',
  what_to_verify: 'warning',
  deadline_watch: 'warning',
  filing_considerations: 'info',

  // Reflective / Support
  emotional_insight: 'support',
  validation_support: 'support',
  gentle_reframe: 'support',
  pattern_detected: 'info',
  relationship_dynamic: 'support',

  // Memory / Organization
  pinworthy_points: 'neutral',
  save_to_case_suggestions: 'neutral',
  related_case_context: 'info',
  linked_history: 'info',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getPanelTitle(type: PanelType): string {
  return PANEL_TITLES[type] ?? type;
}

export function getPanelTone(type: PanelType): PanelTone {
  return PANEL_TONES[type] ?? 'neutral';
}
