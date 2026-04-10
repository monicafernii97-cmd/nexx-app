/**
 * Response Modes — Mode-specific output skeletons
 * 
 * IMPORTANT: These section lists are HIDDEN INTERNAL REASONING GUIDES,
 * NOT mandatory visible output headings. The model uses them as a checklist
 * behind the scenes but chooses the most natural surface form:
 * 
 * - Mode A — Natural conversational: Simple/emotional → pure prose, no headings
 * - Mode B — Lightly structured: Medium complexity → 1-2 headings, mostly prose
 * - Mode C — Full structured panels: Complex legal → all sections visible
 * 
 * The developer prompt instructs: "Use the response structure as internal
 * reasoning. Choose the surface format that best fits this question's
 * complexity. DO NOT render rigid sections robotically."
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
    sections: ['Overview', 'Key Point', 'Next Steps'],
    description: 'General adaptive mode — model decides structure based on question complexity',
  },
  direct_legal_answer: {
    mode: 'direct_legal_answer',
    sections: ['Overview', 'What This Means', 'What Matters Legally', 'Next Steps'],
    description: 'Direct legal question requiring a clear, sourced legal answer',
  },
  local_procedure: {
    mode: 'local_procedure',
    sections: ['Overview', 'Verified Process', 'What Happens Next', 'Documents Needed', 'Mistakes to Avoid'],
    description: 'Local court procedure requiring jurisdiction-specific process steps',
  },
  document_analysis: {
    mode: 'document_analysis',
    sections: ['What This Says', 'What Matters', 'Risk/Leverage Points', 'Strategic Use', 'Next Steps'],
    description: 'Analysis of an uploaded document — order, motion, or other filing',
  },
  judge_lens_strategy: {
    mode: 'judge_lens_strategy',
    sections: ["Judge's View", 'Strong Facts', 'Weak Spots', 'Neutral Framing', 'Next Steps', 'Court-Ready Version'],
    description: 'Strategic analysis through the lens of how a judge would evaluate',
  },
  court_ready_drafting: {
    mode: 'court_ready_drafting',
    sections: ['Purpose', 'Structure', 'Draft Text', 'Formatting Notes', 'Filing Notes'],
    description: 'Court-ready document drafting — formal filing language',
  },
  pattern_analysis: {
    mode: 'pattern_analysis',
    sections: ['Overview', 'Pattern', 'Why It Matters', 'Evidence to Preserve', 'Neutral Presentation', 'Next Steps'],
    description: 'Behavioral pattern analysis across multiple incidents',
  },
  support_grounding: {
    mode: 'support_grounding',
    sections: ['What Matters Now', 'What Not to Do', '3 Actions', 'Grounded Perspective'],
    description: 'Emotional support and grounding for overwhelmed users',
  },
  safety_escalation: {
    mode: 'safety_escalation',
    sections: ['Immediate Priority', 'Immediate Steps', 'Emergency Options', 'Documentation', 'Next Steps'],
    description: 'Safety escalation — user or children may be at risk',
  },
};

/**
 * Get the section skeleton for the current route mode.
 * Used by the developer prompt builder to inject mode-specific guidance.
 */
export function getResponseSkeleton(mode: RouteMode): ResponseModeSkeleton {
  return RESPONSE_MODE_SKELETONS[mode] ?? RESPONSE_MODE_SKELETONS.adaptive_chat;
}
