/**
 * Batch Exhibit Cover Draft Generator
 *
 * Drafts multiple exhibit cover summaries in sequence.
 * Sequential for safety — avoids concurrent rate-limit issues.
 *
 * Returns a map of label → result for easy lookup during patching.
 */

import type { ExhibitCoverDraftInput, ExhibitCoverDraftResult } from './types';
import { generateExhibitCoverDraft } from './generateExhibitCoverDraft';

/**
 * Generate cover drafts for a batch of exhibit inputs.
 *
 * @returns Map of exhibit label → draft result
 */
export async function generateExhibitCoverDrafts(
  inputs: ExhibitCoverDraftInput[],
): Promise<Record<string, ExhibitCoverDraftResult>> {
  const results: Record<string, ExhibitCoverDraftResult> = {};

  for (const input of inputs) {
    results[input.label] = await generateExhibitCoverDraft(input);
  }

  return results;
}
