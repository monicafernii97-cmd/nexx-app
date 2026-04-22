/**
 * Incident Timeline Builder
 *
 * Sorts, deduplicates, and merges incident events + timeline candidates
 * into display-ready chronological events for the canonical model.
 */

import type { TimelineEventDisplay } from '../types';

// ═══════════════════════════════════════════════════════════════
// Input
// ═══════════════════════════════════════════════════════════════

/** A raw timeline event from the assembly layer. */
export type RawTimelineEvent = {
  date?: string;
  title: string;
  description?: string;
  sourceRefs?: string[];
  nodeId?: string;
};

// ═══════════════════════════════════════════════════════════════
// Builder
// ═══════════════════════════════════════════════════════════════

/**
 * Build a deduplicated, sorted list of timeline events.
 *
 * @param events - Raw timeline events from assembly
 * @returns Sorted, deduplicated TimelineEventDisplay array
 */
export function buildIncidentTimeline(
  events: RawTimelineEvent[],
): TimelineEventDisplay[] {
  if (!events.length) return [];

  // Deduplicate by title + date combination
  const seen = new Set<string>();
  const unique: RawTimelineEvent[] = [];

  for (const event of events) {
    const key = `${(event.date || '').toLowerCase()}|${event.title.toLowerCase().trim()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(event);
    }
  }

  // Sort chronologically (events without dates go to the end)
  const sorted = unique.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return parseDate(a.date) - parseDate(b.date);
  });

  return sorted.map((event) => ({
    date: event.date,
    title: event.title,
    description: event.description,
    sourceRefs: event.sourceRefs,
  }));
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Parse a date string to a numeric timestamp for sorting.
 * Handles ISO dates, US-style dates, and partial dates.
 */
function parseDate(dateStr: string): number {
  const parsed = Date.parse(dateStr);
  if (!isNaN(parsed)) return parsed;

  // Try extracting year as fallback
  const yearMatch = dateStr.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) return Date.parse(`${yearMatch[0]}-01-01`);

  return Number.MAX_SAFE_INTEGER; // Unknown dates sort last
}
