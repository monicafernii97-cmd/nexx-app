/**
 * Presentation Rules — maps ResponseIntent to panel order + allowed actions.
 *
 * Key design rule: "Do not show every action on every response.
 * Do not force every answer into legal-analysis format."
 */

import type {
  ResponseIntent,
  ResponsePresentation,
  PanelType,
  ActionType,
  EligibilityFlags,
} from './types';

// ---------------------------------------------------------------------------
// Intent → Panel Order
// ---------------------------------------------------------------------------

const INTENT_PANEL_ORDER: Record<ResponseIntent, PanelType[]> = {
  support: [
    'validation_support',
    'emotional_insight',
    'gentle_reframe',
    'key_takeaway',
    'save_to_case_suggestions',
  ],
  analysis: [
    'overview',
    'what_this_means',
    'judge_lens',
    'risk_concern',
    'strength_highlight',
    'good_faith_positioning',
    'best_next_steps',
    'save_to_case_suggestions',
  ],
  strategy: [
    'overview',
    'strongest_framing',
    'judge_lens',
    'strategic_reframe',
    'risk_concern',
    'strength_highlight',
    'best_next_steps',
    'what_to_watch',
  ],
  drafting: [
    'overview',
    'suggested_reply',
    'alternate_version',
    'more_neutral_version',
    'tone_adjustment',
    'why_this_wording_works',
    'good_faith_positioning',
    'save_to_case_suggestions',
  ],
  incident: [
    'incident_summary',
    'what_this_means',
    'timeline_candidate',
    'documentation_gap',
    'judge_lens',
    'strength_highlight',
    'risk_concern',
    'save_to_case_suggestions',
  ],
  procedure: [
    'overview',
    'procedure_notes',
    'local_context',
    'filing_considerations',
    'deadline_watch',
    'what_to_verify',
    'best_next_steps',
    'save_to_case_suggestions',
  ],
  evidence: [
    'overview',
    'exhibit_note',
    'proof_strength',
    'fact_vs_feeling',
    'documentation_gap',
    'judge_lens',
  ],
  mixed: [
    'overview',
    'what_this_means',
    'judge_lens',
    'strength_highlight',
    'risk_concern',
    'best_next_steps',
    'save_to_case_suggestions',
  ],
};

// ---------------------------------------------------------------------------
// Intent → Recommended Actions
// ---------------------------------------------------------------------------

const INTENT_RECOMMENDED_ACTIONS: Record<ResponseIntent, ActionType[]> = {
  support: ['save_note'],
  analysis: ['save_strategy', 'pin'],
  strategy: ['save_strategy', 'pin'],
  drafting: ['save_draft', 'copy'],
  incident: ['save_to_case'],
  procedure: ['save_to_case'],
  evidence: ['convert_to_exhibit'],
  mixed: ['save_note'],
};

// ---------------------------------------------------------------------------
// Intent → Eligibility Defaults
// ---------------------------------------------------------------------------

const INTENT_ELIGIBILITY: Record<ResponseIntent, EligibilityFlags> = {
  support: {
    timelineEligible: false,
    incidentEligible: false,
    exhibitEligible: false,
    draftEligible: false,
    templateEligible: false,
  },
  analysis: {
    timelineEligible: false,
    incidentEligible: false,
    exhibitEligible: false,
    draftEligible: false,
    templateEligible: false,
  },
  strategy: {
    timelineEligible: false,
    incidentEligible: false,
    exhibitEligible: false,
    draftEligible: true,
    templateEligible: false,
  },
  drafting: {
    timelineEligible: false,
    incidentEligible: false,
    exhibitEligible: false,
    draftEligible: true,
    templateEligible: true,
  },
  incident: {
    timelineEligible: true,
    incidentEligible: true,
    exhibitEligible: true,
    draftEligible: false,
    templateEligible: false,
  },
  procedure: {
    timelineEligible: false,
    incidentEligible: false,
    exhibitEligible: false,
    draftEligible: false,
    templateEligible: true,
  },
  evidence: {
    timelineEligible: true,
    incidentEligible: false,
    exhibitEligible: true,
    draftEligible: false,
    templateEligible: false,
  },
  mixed: {
    timelineEligible: false,
    incidentEligible: false,
    exhibitEligible: false,
    draftEligible: false,
    templateEligible: false,
  },
};

// ---------------------------------------------------------------------------
// Universal + tier-based allowed actions
// ---------------------------------------------------------------------------

const UNIVERSAL_ACTIONS: ActionType[] = ['copy', 'save_note', 'pin'];
const MEDIUM_ACTIONS: ActionType[] = ['save_to_case', 'save_strategy', 'save_good_faith', 'save_draft'];
const HIGHER_ACTIONS: ActionType[] = [
  'add_to_timeline',
  'convert_to_incident',
  'convert_to_exhibit',
  'insert_into_template',
  'create_draft',
];

function buildAllowedActions(eligibility: EligibilityFlags): ActionType[] {
  const actions: ActionType[] = [...UNIVERSAL_ACTIONS, ...MEDIUM_ACTIONS];

  // Use HIGHER_ACTIONS as single source of truth for higher-tier actions
  const eligibilityMap: Record<string, boolean | undefined> = {
    add_to_timeline: eligibility.timelineEligible,
    convert_to_incident: eligibility.incidentEligible,
    convert_to_exhibit: eligibility.exhibitEligible,
    insert_into_template: eligibility.templateEligible,
    create_draft: eligibility.draftEligible,
  };

  for (const action of HIGHER_ACTIONS) {
    if (eligibilityMap[action]) actions.push(action);
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Build a ResponsePresentation for a given intent.
 * Determines which panels to show, in what order, and which actions are available.
 */
export function buildPresentation(intent: ResponseIntent): ResponsePresentation {
  const panelOrder = INTENT_PANEL_ORDER[intent] ?? INTENT_PANEL_ORDER.mixed;
  const recommendedActions = INTENT_RECOMMENDED_ACTIONS[intent] ?? INTENT_RECOMMENDED_ACTIONS.mixed;
  const eligibility = INTENT_ELIGIBILITY[intent] ?? INTENT_ELIGIBILITY.mixed;
  const allowedActions = buildAllowedActions(eligibility);

  return {
    intent,
    panelOrder,
    allowedActions,
    recommendedActions,
    saveSuggestions: [], // Populated at render time by the AI or preprocessing
    eligibility,
  };
}

/**
 * Get the default panel order for an intent.
 */
export function getPanelOrder(intent: ResponseIntent): PanelType[] {
  return INTENT_PANEL_ORDER[intent] ?? INTENT_PANEL_ORDER.mixed;
}
