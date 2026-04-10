/**
 * Suppress weak/hollow artifacts that don't meet quality thresholds.
 * Prevents the model from generating thin artifacts just to fill the schema.
 */

import type { NexxAssistantResponse } from '../../types';
import {
  validateDraft,
  validateTimeline,
  validateExhibit,
  validateJudgeSimulation,
  validateOppositionSimulation,
  validateConfidence,
} from './validators';

/**
 * Null out any artifact that doesn't meet quality thresholds.
 * Modifies the response in place and returns it.
 */
export function suppressWeakArtifacts(response: NexxAssistantResponse): NexxAssistantResponse {
  const { artifacts } = response;

  // Draft with no substantive content → null
  if (artifacts.draftReady && !validateDraft(artifacts.draftReady)) {
    artifacts.draftReady = null;
  }

  // Timeline with <2 events → null
  if (artifacts.timelineReady && !validateTimeline(artifacts.timelineReady)) {
    artifacts.timelineReady = null;
  }

  // Exhibit with no evidence references → null
  if (artifacts.exhibitReady && !validateExhibit(artifacts.exhibitReady)) {
    artifacts.exhibitReady = null;
  }

  // Judge simulation with all scores at 0 or empty arrays → null
  if (artifacts.judgeSimulation && !validateJudgeSimulation(artifacts.judgeSimulation)) {
    artifacts.judgeSimulation = null;
  }

  // Opposition simulation with empty attack points → null
  if (artifacts.oppositionSimulation && !validateOppositionSimulation(artifacts.oppositionSimulation)) {
    artifacts.oppositionSimulation = null;
  }

  // Confidence with missing basis → null
  if (artifacts.confidence && !validateConfidence(artifacts.confidence)) {
    artifacts.confidence = null;
  }

  return response;
}
