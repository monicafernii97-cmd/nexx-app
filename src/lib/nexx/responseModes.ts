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
