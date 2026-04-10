/**
 * Case Graph Updater — merges partial updates into the existing graph.
 */

import type { CaseGraph } from './caseGraph';
import { createEmptyCaseGraph } from './caseGraph';

/**
 * Deep-merge a partial case graph update into the existing graph.
 * Arrays are replaced (not appended) to avoid stale data accumulation.
 * Objects are shallow-merged.
 */
export function mergeCaseGraph(
  existing: CaseGraph | undefined,
  updates: Partial<CaseGraph>
): CaseGraph {
  const base = existing ?? createEmptyCaseGraph();

  return {
    jurisdiction: { ...base.jurisdiction, ...updates.jurisdiction },
    parties: { ...base.parties, ...updates.parties },
    children: updates.children ?? base.children,
    custodyStructure: { ...base.custodyStructure, ...updates.custodyStructure },
    currentOrders: updates.currentOrders ?? base.currentOrders,
    openIssues: updates.openIssues ?? base.openIssues,
    timeline: mergeTimeline(base.timeline, updates.timeline),
    evidenceThemes: updates.evidenceThemes ?? base.evidenceThemes,
    communicationPatterns: updates.communicationPatterns ?? base.communicationPatterns,
    proceduralState: { ...base.proceduralState, ...updates.proceduralState },
  };
}

/**
 * Merge timeline events — append new events, deduplicate by date+event.
 */
function mergeTimeline(
  existing: CaseGraph['timeline'],
  updates?: CaseGraph['timeline'] | null
): CaseGraph['timeline'] {
  if (!updates) return existing;

  const seen = new Set(existing.map((e) => `${e.date}::${e.event}`));
  const merged = [...existing];

  for (const event of updates) {
    const key = `${event.date}::${event.event}`;
    if (!seen.has(key)) {
      merged.push(event);
      seen.add(key);
    }
  }

  // Sort by date
  return merged.sort((a, b) => a.date.localeCompare(b.date));
}
