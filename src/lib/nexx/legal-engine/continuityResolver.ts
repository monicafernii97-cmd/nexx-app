import type { RouteMode } from '../../types';
import { extractSharedLegalTerms, hasConversationalContinuationSignal, hasExplicitNewIssueSignal } from './legalSignals';

export type ContinuityResolution = {
  kind: 'same_issue' | 'related_extension' | 'new_issue' | 'uncertain';
  score: number;
  reasonCodes: string[];
  inheritedTerms: string[];
};

const CONTEXT_ROUTES = new Set<RouteMode>([
  'document_analysis', 'order_interpretation', 'possession_access_schedule',
  'party_message_draft', 'supportive_strategy', 'co_parent_response',
  'documentation_strategy', 'deescalation_response', 'packed_case_intake',
  'litigation_navigation', 'court_response_planning', 'pro_se_guidance',
  'court_narrative_builder', 'filing_walkthrough', 'court_ready_drafting',
]);

export function resolveContinuity(args: {
  message: string;
  activeMode?: RouteMode;
  hasActiveDocumentContext?: boolean;
  activeIssueText?: string;
}): ContinuityResolution {
  if (hasExplicitNewIssueSignal(args.message)) {
    return { kind: 'new_issue', score: 1, reasonCodes: ['explicit_new_issue'], inheritedTerms: [] };
  }
  const hasContext = Boolean(args.hasActiveDocumentContext || (args.activeMode && CONTEXT_ROUTES.has(args.activeMode)) || args.activeIssueText?.trim());
  if (!hasContext) return { kind: 'new_issue', score: 0, reasonCodes: ['no_active_context'], inheritedTerms: [] };

  const currentTerms = extractSharedLegalTerms(args.message);
  const issueTerms = extractSharedLegalTerms(args.activeIssueText ?? '');
  const overlap = currentTerms.filter((term) => issueTerms.includes(term));
  const continuation = hasConversationalContinuationSignal(args.message);
  if (continuation || overlap.length > 0) {
    return {
      kind: continuation && overlap.length === 0 ? 'related_extension' : 'same_issue',
      score: Math.min(1, 0.7 + overlap.length * 0.05),
      reasonCodes: [continuation ? 'conversational_continuation' : 'issue_term_overlap', ...(overlap.length ? ['issue_term_overlap'] : [])],
      inheritedTerms: issueTerms.slice(0, 32),
    };
  }
  return { kind: 'uncertain', score: 0.45, reasonCodes: ['active_context_without_explicit_transition'], inheritedTerms: issueTerms.slice(0, 32) };
}
