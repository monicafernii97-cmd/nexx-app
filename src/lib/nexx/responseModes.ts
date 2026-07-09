/**
 * Response Modes
 *
 * These section lists are hidden internal reasoning guides, not mandatory
 * visible headings. The developer prompt tells the model to choose the most
 * natural surface format for the user's moment.
 */

import type { RouteMode } from '../types';

export interface ResponseModeSkeleton {
  mode: RouteMode;
  sections: string[];
  description: string;
}

export const RESPONSE_MODE_SKELETONS: Record<RouteMode, ResponseModeSkeleton> = {
  adaptive_chat: {
    mode: 'adaptive_chat',
    sections: ['Direct Answer', 'Key Point', 'Practical Next Step'],
    description: 'General adaptive mode where the model chooses structure based on complexity',
  },
  direct_legal_answer: {
    mode: 'direct_legal_answer',
    sections: ['Direct Answer', 'Legal Issue', 'Rule or Source to Verify', 'Assumptions and Gaps', 'Next Steps'],
    description: 'Direct legal question requiring a clear, sourced legal answer',
  },
  local_procedure: {
    mode: 'local_procedure',
    sections: ['Where You Are Now', 'Verified Process', 'What Happens Next', 'Documents Needed', 'Mistakes to Avoid'],
    description: 'Local court procedure requiring jurisdiction-specific process steps',
  },
  document_analysis: {
    mode: 'document_analysis',
    sections: ['Direct Answer', 'Document Language', 'Clause Hierarchy', 'Strongest and Weakest Interpretations', 'Risk', 'Next Step or Draft'],
    description: 'Analysis of an uploaded document, order, motion, or filing',
  },
  order_interpretation: {
    mode: 'order_interpretation',
    sections: ['Direct Answer', 'Controlling Language', 'Competing Language', 'Why It Controls', 'Practical Meaning', 'Suggested Next Step'],
    description: 'Direct interpretation of what an uploaded court order or filing means',
  },
  possession_access_schedule: {
    mode: 'possession_access_schedule',
    sections: ['Direct Answer', 'Controlling Possession Clause', 'Competing Clause', 'Timing', 'Practical Meaning', 'Suggested Response'],
    description: 'Possession, access, exchange, holiday, weekend, or schedule interpretation',
  },
  party_message_draft: {
    mode: 'party_message_draft',
    sections: ['Draft Message', 'Why This Wording Fits', 'Optional Firmer Version', 'Next Step'],
    description: 'Plain-language message drafting for AppClose, co-parenting, notice, or other-party communication',
  },
  supportive_strategy: {
    mode: 'supportive_strategy',
    sections: ['Calm Acknowledgment', 'Legal Anchor', 'What Matters', 'Strategy', 'Next Step'],
    description: 'Client-care legal support for emotional, pressured, or reactive moments',
  },
  co_parent_response: {
    mode: 'co_parent_response',
    sections: ['Calm Anchor', 'What Needs A Response', 'Neutral Draft', 'Firmer Draft', 'Documentation'],
    description: 'Court-appropriate co-parent response strategy and drafting',
  },
  documentation_strategy: {
    mode: 'documentation_strategy',
    sections: ['What To Save', 'Neutral Notes', 'Evidence Timeline', 'What To Avoid', 'Next Step'],
    description: 'Evidence preservation and neutral documentation guidance',
  },
  deescalation_response: {
    mode: 'deescalation_response',
    sections: ['Slow Down', 'Do Not Take Bait', 'Order-Based Response', 'Document', 'Stop Point'],
    description: 'De-escalation support for pressured co-parent conflict',
  },
  packed_case_intake: {
    mode: 'packed_case_intake',
    sections: ['Supportive Opening', 'First Priority', 'Issue Tracks', 'Co-Parent Response', 'Evidence', 'Pro Se/Cost', 'Judge Explanation', 'Next Steps'],
    description: 'Packed multi-issue family-law intake and litigation navigation',
  },
  litigation_navigation: {
    mode: 'litigation_navigation',
    sections: ['Deadline First', 'Court Posture', 'Response Plan', 'Evidence', 'Resources', 'Next Steps'],
    description: 'Court filing, service, deadline, and response planning',
  },
  court_response_planning: {
    mode: 'court_response_planning',
    sections: ['Filed Document', 'Deadline', 'Likely Response', 'Evidence', 'Drafting Readiness'],
    description: 'Planning the response to a filed family-law court document',
  },
  pro_se_guidance: {
    mode: 'pro_se_guidance',
    sections: ['Practical Read', 'Doable Pro Se', 'Higher Risk', 'Limited-Scope Help', 'Next Step'],
    description: 'Respectful pro se feasibility and limited-scope attorney guidance',
  },
  attorney_resource_guidance: {
    mode: 'attorney_resource_guidance',
    sections: ['Cost Categories', 'Resource Types', 'County/State Needed', 'Official Sources', 'Next Step'],
    description: 'Attorney, legal-aid, fee, and local resource guidance without invented prices',
  },
  court_narrative_builder: {
    mode: 'court_narrative_builder',
    sections: ['Judge-Ready Theory', 'Current Order', 'Timeline', 'Evidence', 'Requested Relief'],
    description: 'Convert emotional story into court-ready explanation',
  },
  filing_walkthrough: {
    mode: 'filing_walkthrough',
    sections: ['What Was Filed', 'Deadline', 'Checklist', 'Filing Steps', 'Service', 'Proof'],
    description: 'Step-by-step pro se filing walkthrough with readiness checks',
  },
  judge_lens_strategy: {
    mode: 'judge_lens_strategy',
    sections: ["Judge's View", 'Strong Facts', 'Weak Spots', 'Neutral Framing', 'Next Steps', 'Court-Appropriate Version'],
    description: 'Strategic analysis through the lens of how a judge would evaluate the issue',
  },
  court_ready_drafting: {
    mode: 'court_ready_drafting',
    sections: ['Drafting Purpose', 'Missing Filing Facts', 'Draft Text', 'Filing-Readiness Gate', 'Attorney or Local-Rule Review'],
    description: 'Court-facing drafting with explicit filing-readiness gates',
  },
  pattern_analysis: {
    mode: 'pattern_analysis',
    sections: ['Pattern', 'Why It Matters', 'Evidence to Preserve', 'Counterargument Risk', 'Neutral Presentation', 'Next Steps'],
    description: 'Behavioral pattern analysis across multiple incidents',
  },
  support_grounding: {
    mode: 'support_grounding',
    sections: ['What Matters Now', 'Issue Narrowing', 'What Not to Do', 'Next 3 Actions', 'Optional Draft Language'],
    description: 'Emotional support and grounded execution help for overwhelmed users',
  },
  safety_escalation: {
    mode: 'safety_escalation',
    sections: ['Immediate Priority', 'Immediate Steps', 'Emergency Options', 'Documentation', 'Next Steps'],
    description: 'Safety escalation when the user or children may be at risk',
  },
};

export function getResponseSkeleton(mode: RouteMode): ResponseModeSkeleton {
  return RESPONSE_MODE_SKELETONS[mode] ?? RESPONSE_MODE_SKELETONS.adaptive_chat;
}
