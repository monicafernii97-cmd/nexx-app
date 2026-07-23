import type { NexxAssistantResponse, RouteMode } from '../types';

const PLAIN_TEXT_ROUTES = new Set<RouteMode>([
  'adaptive_chat',
  'party_message_draft',
  'supportive_strategy',
  'co_parent_response',
  'documentation_strategy',
  'deescalation_response',
  'pattern_analysis',
  'support_grounding',
  'safety_escalation',
]);

const HIGH_REASONING_ROUTES = new Set<RouteMode>([
  'document_analysis',
  'order_interpretation',
  'possession_access_schedule',
  'packed_case_intake',
  'court_response_planning',
  'court_narrative_builder',
  'judge_lens_strategy',
  'court_ready_drafting',
]);

/** Conversational turns do not need the full legal-artifact JSON envelope from the model. */
export function usesPlainTextResponse(routeMode: RouteMode) {
  return PLAIN_TEXT_ROUTES.has(routeMode);
}

/** Keep simple chat responsive while reserving deeper reasoning for document/legal work. */
export function reasoningEffortForRoute(routeMode: RouteMode): 'low' | 'medium' | 'high' {
  if (HIGH_REASONING_ROUTES.has(routeMode)) return 'high';
  if (routeMode === 'pattern_analysis' || routeMode === 'safety_escalation') return 'medium';
  return 'low';
}

/** Wrap a plain conversational answer for the existing persistence/rendering pipeline. */
export function plainTextAssistantResponse(message: string): NexxAssistantResponse {
  return {
    message,
    artifacts: {
      draftReady: null,
      timelineReady: null,
      exhibitReady: null,
      judgeSimulation: null,
      oppositionSimulation: null,
      confidence: null,
    },
    documentAnswer: null,
    legalInterpretation: null,
    litigationNavigation: null,
    localResourceLookup: null,
    legalAuthorities: null,
    proSeDraftingReadiness: null,
    orderVersion: null,
    legalBasis: [],
    deadlineAnalysis: null,
  };
}
