import type { NexxAssistantResponse, RouteMode } from '../types';
import {
  isNaturalRelationalRoute,
  responseReasoningEffort,
  type ResponseReasoningEffort,
} from './responseLifecycle';

/** Conversational turns do not need the full legal-artifact JSON envelope from the model. */
export function usesPlainTextResponse(routeMode: RouteMode) {
  return isNaturalRelationalRoute(routeMode);
}

/** Use at least medium reasoning for every user turn and high for complex work. */
export function reasoningEffortForRoute(
  routeMode: RouteMode,
  options: { highComplexity?: boolean } = {},
): ResponseReasoningEffort {
  return responseReasoningEffort(routeMode, options);
}

/**
 * Wrap provider prose for persistence without trimming, rewriting, rendering,
 * or otherwise changing the answer the model produced.
 */
export function preservePlainProviderProse(message: string): NexxAssistantResponse {
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

/** Backward-compatible name used by the worker's plain-text transport. */
export function plainTextAssistantResponse(message: string): NexxAssistantResponse {
  return preservePlainProviderProse(message);
}
