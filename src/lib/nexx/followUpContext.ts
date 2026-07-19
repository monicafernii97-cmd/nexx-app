import type { RouteMode } from '../types';
import { classifyFollowUpIntent } from './router';
import type { DocumentReferenceDetection } from './documentReferenceDetection';

export type FollowUpContextMessage = {
  role: 'user' | 'assistant';
  content: string;
  status?: 'draft' | 'committed' | 'degraded' | 'failed' | 'deleted';
};

const DOCUMENT_GROUNDED_FOLLOW_UP_ROUTES = new Set<RouteMode>([
  'document_analysis',
  'order_interpretation',
  'possession_access_schedule',
  'party_message_draft',
  'supportive_strategy',
  'co_parent_response',
  'documentation_strategy',
  'deescalation_response',
  'packed_case_intake',
  'litigation_navigation',
  'court_response_planning',
  'pro_se_guidance',
  'attorney_resource_guidance',
  'court_narrative_builder',
  'filing_walkthrough',
  'court_ready_drafting',
]);

export function isDocumentGroundedFollowUpRoute(mode?: RouteMode) {
  return Boolean(mode && DOCUMENT_GROUNDED_FOLLOW_UP_ROUTES.has(mode));
}

export function shouldRequireDocumentGroundedDraftInterpretation(args: {
  routeMode: RouteMode;
  sourcePacketCount: number;
  hasActiveDocumentContext: boolean;
  followUpSummary?: string;
  documentReference: Pick<DocumentReferenceDetection, 'referencesDocument'>;
}) {
  const isDraftRoute = args.routeMode === 'co_parent_response' || args.routeMode === 'party_message_draft';
  const hasCurrentDocumentSignal = Boolean(args.followUpSummary?.trim()) || args.documentReference.referencesDocument;
  return isDraftRoute &&
    args.sourcePacketCount > 0 &&
    args.hasActiveDocumentContext &&
    hasCurrentDocumentSignal;
}
function normalizedMessage(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Build a bounded retrieval query for a follow-up without trusting prior
 * assistant prose as source material. The most recent user issue statements
 * are retained whole so a route transition cannot reduce retrieval to generic
 * wording such as "What should I say?".
 */
export function buildContextualDocumentFollowUpMessage(
  message: string,
  recentMessages: FollowUpContextMessage[],
  activeMode?: RouteMode,
  maxContextCharacters = 4_000
) {
  const currentMessage = normalizedMessage(message);
  if (
    classifyFollowUpIntent(message) === 'new_issue' ||
    !isDocumentGroundedFollowUpRoute(activeMode)
  ) {
    return currentMessage;
  }

  const eligible = recentMessages
    .filter((recent) =>
      recent.role === 'user' &&
      (
        recent.status === undefined ||
        recent.status === 'committed' ||
        recent.status === 'degraded'
      )
    )
    .map((recent) => normalizedMessage(recent.content))
    .filter(Boolean)
    .slice(-8);

  const deduped = Array.from(new Set(eligible));
  const selected: string[] = [];
  let used = 0;
  for (let index = deduped.length - 1; index >= 0; index -= 1) {
    const candidate = deduped[index];
    if (candidate === currentMessage) continue;
    const addedLength = candidate.length + (selected.length > 0 ? 1 : 0);
    if (used + addedLength > maxContextCharacters) continue;
    selected.unshift(candidate);
    used += addedLength;
  }

  if (selected.length === 0) return currentMessage;
  return `${currentMessage}\n\nRecent active issue context:\n${selected.join('\n')}`;
}
