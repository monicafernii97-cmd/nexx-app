/**
 * Mock Data — test data for development and visual validation.
 *
 * Provides AssistantResponseViewModel objects for each of the 8 intents
 * so components can be developed and tested without a live backend.
 */

import type { AssistantResponseViewModel, PanelData, ResponseIntent } from './types';
import { buildPresentation } from './presentation-rules';
import { getPanelTone } from './panel-library';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function buildPanels(types: string[], contents: Record<string, string | string[]>): PanelData[] {
  return types
    .filter((t) => contents[t])
    .map((type) => ({
      type: type as PanelData['type'],
      title: '', // Will be resolved by PanelRenderer from panel-library
      content: contents[type] ?? '',
      tone: getPanelTone(type as PanelData['type']),
    }));
}

// ---------------------------------------------------------------------------
// Support Intent
// ---------------------------------------------------------------------------

export const MOCK_SUPPORT: AssistantResponseViewModel = (() => {
  const presentation = buildPresentation('support');
  return {
    responseId: 'mock-support-001',
    presentation,
    panels: buildPanels(presentation.panelOrder as string[], {
      validation_support:
        'What you are feeling right now is completely understandable. Navigating a custody modification while managing daily co-parenting stress is one of the hardest things a parent can go through.',
      emotional_insight:
        'The frustration you are experiencing likely stems from feeling unheard in a system that moves slowly. That is a normal response to an abnormal amount of pressure.',
      gentle_reframe:
        'Instead of viewing this as a setback, consider that the delay may actually give you more time to strengthen your documentation before the hearing.',
      key_takeaway:
        'You are doing better than you think. The fact that you are preparing strategically shows exactly the kind of focus that courts respond to positively.',
      save_to_case_suggestions: [
        'This looks like a support note — save as case_note.',
        'If this relates to your mental health documentation, save as key_fact.',
      ],
    }),
  };
})();

// ---------------------------------------------------------------------------
// Analysis Intent
// ---------------------------------------------------------------------------

export const MOCK_ANALYSIS: AssistantResponseViewModel = (() => {
  const presentation = buildPresentation('analysis');
  return {
    responseId: 'mock-analysis-001',
    caseId: 'case-demo-001',
    presentation,
    panels: buildPanels(presentation.panelOrder as string[], {
      overview:
        'Based on the current temporary orders and the communication pattern you described, here is a structured analysis of your position regarding the proposed schedule modification.',
      what_this_means:
        'The opposing party is requesting a change to the standard possession order that would reduce your mid-week contact. Under Texas Family Code § 153.312, you have the right to maintain the standard schedule unless there is a showing of changed circumstances.',
      judge_lens:
        'A judge will evaluate whether the proposed change serves the child\'s best interest. Courts in Fort Bend County tend to favor stability unless there is documented evidence of disruption to the child\'s routine.',
      risk_concern: [
        'If you refuse all modifications without offering alternatives, it may appear inflexible.',
        'The lack of documented communication about scheduling could weaken your position.',
        'Tone in recent messages may be perceived as confrontational.',
      ],
      strength_highlight: [
        'Your consistent exercise of possession time demonstrates engagement.',
        'You have documented school pick-up and activity involvement.',
        'Your willingness to discuss alternatives shows good faith.',
      ],
      good_faith_positioning:
        'You offered a workable alternative instead of refusing. This positions you as cooperative and child-focused.',
      best_next_steps: [
        'Document all schedule adherence for the last 90 days.',
        'Prepare a counter-proposal that addresses their concern while preserving your time.',
        'Draft a response that opens with acknowledgment before presenting your position.',
      ],
      save_to_case_suggestions: [
        'This appears to be a strategy point — save as strategy_point.',
        'The risk items could be saved individually as risk_concern.',
      ],
    }),
  };
})();

// ---------------------------------------------------------------------------
// Strategy Intent
// ---------------------------------------------------------------------------

export const MOCK_STRATEGY: AssistantResponseViewModel = (() => {
  const presentation = buildPresentation('strategy');
  return {
    responseId: 'mock-strategy-001',
    caseId: 'case-demo-001',
    presentation,
    panels: buildPanels(presentation.panelOrder as string[], {
      overview:
        'Here is a strategic framing for your response to the motion for modification.',
      strongest_framing:
        'Frame your position around the child\'s established routine and your documented involvement. The strongest argument is stability — the current arrangement has been working, and disruption requires justification.',
      judge_lens:
        'A judge in the 387th District Court will want to see that both parents prioritize the child\'s needs over personal convenience. Demonstrating flexibility while maintaining boundaries is key.',
      strategic_reframe:
        'Instead of opposing the modification directly, propose a trial period with specific conditions. This shows reasonableness while protecting your interests.',
      risk_concern: [
        'Appearing rigid could undermine your credibility.',
        'If you do not address their stated concerns, the court may view your position as dismissive.',
      ],
      strength_highlight: [
        'Your consistent involvement in school and extracurricular activities is well-documented.',
        'You have a track record of proposing reasonable alternatives.',
      ],
      best_next_steps: [
        'Draft a counter-proposal with specific dates and conditions.',
        'Gather school attendance and activity records.',
        'Prepare a brief timeline of your involvement over the last 6 months.',
      ],
      what_to_watch:
        'Watch for any escalation in communication tone. If the other party becomes aggressive, document it carefully and respond with neutral, fact-based language.',
    }),
  };
})();

// ---------------------------------------------------------------------------
// Drafting Intent
// ---------------------------------------------------------------------------

export const MOCK_DRAFTING: AssistantResponseViewModel = (() => {
  const presentation = buildPresentation('drafting');
  return {
    responseId: 'mock-drafting-001',
    caseId: 'case-demo-001',
    presentation,
    panels: buildPanels(presentation.panelOrder as string[], {
      overview:
        'Here are drafting options for your response to the co-parent\'s message about changing the Thursday exchange time.',
      suggested_reply:
        'Thank you for reaching out about the Thursday schedule. I understand the timing concern. I am open to discussing an adjustment that works for both of us and keeps [Child]\'s routine consistent. Would moving the exchange to 5:30 PM work for your schedule as well?',
      alternate_version:
        'I appreciate you bringing up the Thursday timing. To keep things smooth for [Child], I\'d suggest we try 5:30 PM for the next two weeks and see how it works. Let me know your thoughts.',
      more_neutral_version:
        'Regarding the Thursday exchange — I\'m available to adjust the time. Please let me know what you have in mind and I\'ll see if we can make it work.',
      tone_adjustment:
        'The suggested reply is warm but professional. If you want a more formal tone for documentation purposes, use the alternate version.',
      why_this_wording_works:
        'Opening with acknowledgment ("Thank you for reaching out") signals cooperation. Centering the child ("keeps [Child]\'s routine consistent") shows the court you prioritize their needs. Offering a specific alternative ("5:30 PM") demonstrates reasonableness.',
      good_faith_positioning:
        'This response reads as flexible rather than defensive. A judge reviewing this exchange would see a parent willing to accommodate.',
      save_to_case_suggestions: [
        'Save the suggested reply as draft_snippet.',
        'This good-faith framing is a strategy_point worth saving.',
      ],
    }),
  };
})();

// ---------------------------------------------------------------------------
// Incident Intent
// ---------------------------------------------------------------------------

export const MOCK_INCIDENT: AssistantResponseViewModel = (() => {
  const presentation = buildPresentation('incident');
  return {
    responseId: 'mock-incident-001',
    caseId: 'case-demo-001',
    presentation,
    panels: buildPanels(presentation.panelOrder as string[], {
      incident_summary:
        'On March 15, 2025, the child was returned 45 minutes late from the scheduled exchange at 6:00 PM. No advance notice was provided. The child reported being tired and having missed dinner.',
      what_this_means:
        'A single late return may not carry significant weight alone, but it becomes relevant when it forms part of a pattern. Document this incident in your timeline and note any similar past occurrences.',
      timeline_candidate:
        'March 15, 2025 — Late return (45 min) from scheduled 6:00 PM exchange. No advance notice. Child missed dinner.',
      documentation_gap:
        'You mentioned the child said they were tired, but there is no written record of what happened during the extra 45 minutes. Consider sending a brief follow-up message to the co-parent documenting the late return.',
      judge_lens:
        'A judge would view this more seriously if it is part of a pattern. A single instance with no harm may be noted but not acted upon. Document consistently.',
      strength_highlight: [
        'You were at the exchange point on time — this establishes your compliance.',
        'Your calm handling of the situation demonstrates emotional maturity.',
      ],
      risk_concern: [
        'Without a contemporaneous record, this could become a "he said / she said" situation.',
        'Overreacting to a single late return could appear controlling.',
      ],
      save_to_case_suggestions: [
        'Save the incident summary as incident_note.',
        'Add the timeline entry as timeline_candidate.',
        'The documentation gap is a key_fact worth noting.',
      ],
    }),
  };
})();

// ---------------------------------------------------------------------------
// Procedure Intent
// ---------------------------------------------------------------------------

export const MOCK_PROCEDURE: AssistantResponseViewModel = (() => {
  const presentation = buildPresentation('procedure');
  return {
    responseId: 'mock-procedure-001',
    caseId: 'case-demo-001',
    presentation,
    panels: buildPanels(presentation.panelOrder as string[], {
      overview:
        'Here is the procedure for filing a Motion for Enforcement in Fort Bend County, Texas.',
      procedure_notes: [
        'File the motion in the court that issued the original order (387th District Court).',
        'Pay the filing fee (currently $317 for civil motions in Fort Bend County).',
        'Serve the opposing party at least 10 days before the hearing date.',
        'Include specific violations with dates, times, and order provisions violated.',
      ],
      local_context:
        'Fort Bend County requires electronic filing through the eFiling system. The 387th District Court typically schedules enforcement hearings within 30-45 days of filing.',
      filing_considerations: [
        'Consider whether mediation is required before filing — check your existing orders for an ADR clause.',
        'If the violations are ongoing, you may request a temporary restraining order simultaneously.',
      ],
      deadline_watch:
        'If your temporary orders expire on June 30, 2025, you need to file before that date to preserve the court\'s ability to enforce those specific provisions.',
      what_to_verify: [
        'Verify the exact order language being violated — quote it directly in your motion.',
        'Confirm whether your case has a mandatory mediation requirement.',
        'Check if there are any pending motions that could affect timing.',
      ],
      best_next_steps: [
        'Gather all documentation of violations.',
        'Draft the Motion for Enforcement using the court\'s required format.',
        'File electronically and request a hearing date.',
      ],
      save_to_case_suggestions: [
        'Save the procedure notes as procedure_note.',
        'The deadline is a key_fact — save it.',
      ],
    }),
  };
})();

// ---------------------------------------------------------------------------
// Evidence Intent
// ---------------------------------------------------------------------------

export const MOCK_EVIDENCE: AssistantResponseViewModel = (() => {
  const presentation = buildPresentation('evidence');
  return {
    responseId: 'mock-evidence-001',
    caseId: 'case-demo-001',
    presentation,
    panels: buildPanels(presentation.panelOrder as string[], {
      overview:
        'Analysis of the text message thread you uploaded from February 2025.',
      exhibit_note:
        'This thread contains 3 messages that demonstrate cooperative communication and 2 that show scheduling flexibility. Mark messages from Feb 12 and Feb 18 as potential exhibits.',
      proof_strength:
        'The messages are strong evidence of your willingness to accommodate schedule changes. The timestamped nature of text messages makes them highly credible as exhibits.',
      fact_vs_feeling:
        'Your message on Feb 12 ("I can adjust the pickup time if that helps") is a factual offer. Avoid characterizing the co-parent\'s response as "dismissive" — let the judge draw that conclusion from the text itself.',
      documentation_gap:
        'There is a 5-day gap between Feb 18 and Feb 23 where no messages were exchanged. If something relevant happened during this period, document it separately.',
      judge_lens:
        'A judge reviewing these messages would see a parent making reasonable offers. The clean, factual tone works in your favor. Do not annotate or highlight — present the raw messages.',
    }),
  };
})();

// ---------------------------------------------------------------------------
// Mixed Intent (default)
// ---------------------------------------------------------------------------

export const MOCK_MIXED: AssistantResponseViewModel = (() => {
  const presentation = buildPresentation('mixed');
  return {
    responseId: 'mock-mixed-001',
    presentation,
    panels: buildPanels(presentation.panelOrder as string[], {
      overview:
        'Here is a combined analysis addressing your question about the upcoming hearing and how to prepare your documentation.',
      what_this_means:
        'The hearing on April 25 will address both the temporary orders modification and the pending enforcement motion. You need to prepare for both issues simultaneously.',
      judge_lens:
        'The judge will look for consistency between your position on modification and your enforcement claims. Make sure your arguments do not contradict each other.',
      strength_highlight: [
        'Your documentation is thorough and well-organized.',
        'You have demonstrated consistent compliance with current orders.',
      ],
      risk_concern: [
        'Pursuing enforcement while opposing modification could appear punitive if not framed carefully.',
      ],
      best_next_steps: [
        'Prepare separate binders for the modification and enforcement issues.',
        'Draft a brief summary connecting the two issues.',
        'Practice presenting your position in 5 minutes or less.',
      ],
      save_to_case_suggestions: [
        'Save this overview as a case_note for hearing prep.',
      ],
    }),
  };
})();

// ---------------------------------------------------------------------------
// All mocks indexed by intent
// ---------------------------------------------------------------------------

/** All mock response view models indexed by ResponseIntent, for development and visual testing. */
export const MOCK_RESPONSES: Record<ResponseIntent, AssistantResponseViewModel> = {
  support: MOCK_SUPPORT,
  analysis: MOCK_ANALYSIS,
  strategy: MOCK_STRATEGY,
  drafting: MOCK_DRAFTING,
  incident: MOCK_INCIDENT,
  procedure: MOCK_PROCEDURE,
  evidence: MOCK_EVIDENCE,
  mixed: MOCK_MIXED,
};
