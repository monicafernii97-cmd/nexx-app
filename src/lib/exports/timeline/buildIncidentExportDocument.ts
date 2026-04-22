/**
 * Incident Export Document Builder
 *
 * Converts incidents + timeline candidates into a CanonicalExportDocument
 * in either summary or exhibit mode.
 */

import type { CanonicalExportDocument, TimelineSection, TimelineVisualData } from '../types';
import { buildIncidentTimeline, type RawTimelineEvent } from './buildIncidentTimeline';

// ═══════════════════════════════════════════════════════════════
// Input
// ═══════════════════════════════════════════════════════════════

/** Configuration for incident export document building. */
export type IncidentExportConfig = {
  title: string;
  subtitle?: string;
  mode: 'summary' | 'exhibit';
  causeNumber?: string;
  jurisdiction?: CanonicalExportDocument['metadata']['jurisdiction'];
};

// ═══════════════════════════════════════════════════════════════
// Builder
// ═══════════════════════════════════════════════════════════════

/**
 * Build a canonical export document from incident/timeline events.
 *
 * @param events - Raw timeline events from assembly
 * @param config - Export configuration
 * @returns CanonicalExportDocument ready for rendering
 */
export function buildIncidentExportDocument(
  events: RawTimelineEvent[],
  config: IncidentExportConfig,
): CanonicalExportDocument {
  const displayEvents = buildIncidentTimeline(events);

  const timelineSection: TimelineSection = {
    kind: 'timeline_section',
    id: 'incident_timeline',
    heading: config.title || 'Incident Timeline',
    events: displayEvents,
  };

  const timelineVisual: TimelineVisualData = {
    mode: config.mode,
    title: config.title,
    events: displayEvents,
  };

  return {
    path: config.mode === 'exhibit' ? 'incident_report' : 'timeline_summary',
    title: config.title,
    subtitle: config.subtitle,
    metadata: {
      causeNumber: config.causeNumber,
      jurisdiction: config.jurisdiction,
    },
    sections: [timelineSection],
    timelineVisual,
  };
}
