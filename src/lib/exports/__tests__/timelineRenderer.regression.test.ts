/**
 * Timeline / Incident Renderer Regression Tests
 *
 * Validates renderTimelineExportHTML produces correct HTML for:
 * visual timeline mode, table mode, profile-driven mode selection,
 * event cards, source references, and empty-state handling.
 */

import { describe, expect, it } from 'vitest';
import { renderTimelineExportHTML } from '../renderers/renderTimelineExportHTML';
import type { CanonicalExportDocument } from '../types';
import { PROFILE_REGISTRY } from '@/lib/jurisdiction/profiles/registry';
import { assertExportProfile } from '@/lib/jurisdiction/assertProfileForPipeline';

const usProfile = assertExportProfile(PROFILE_REGISTRY.get('us-default')!);
const fedProfile = assertExportProfile(PROFILE_REGISTRY.get('federal-default')!);

function makeTimelineDoc(
  overrides: Partial<CanonicalExportDocument> = {},
): CanonicalExportDocument {
  return {
    path: 'timeline_summary',
    title: 'CHRONOLOGICAL TIMELINE',
    metadata: {},
    sections: [],
    timelineVisual: {
      mode: 'summary',
      title: 'Timeline',
      events: [
        { date: '2025-06-15', title: 'Initial filing', description: 'Petition filed.' },
        { date: '2025-08-01', title: 'Hearing', description: 'Temporary orders hearing.' },
        { date: '2025-10-15', title: 'Discovery', description: 'Discovery requests served.', sourceRefs: ['Email', 'Court record'] },
      ],
    },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Structural Tests
// ═══════════════════════════════════════════════════════════════

describe('renderTimelineExportHTML — structural output', () => {
  it('produces valid HTML document shell', () => {
    const html = renderTimelineExportHTML(makeTimelineDoc(), usProfile);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
  });

  it('renders timeline title', () => {
    const html = renderTimelineExportHTML(makeTimelineDoc(), usProfile);
    expect(html).toContain('class="timeline-title"');
    expect(html).toContain('CHRONOLOGICAL TIMELINE');
  });

  it('renders subtitle when present', () => {
    const html = renderTimelineExportHTML(
      makeTimelineDoc({ subtitle: 'Doe v. Doe' }),
      usProfile,
    );
    expect(html).toContain('class="timeline-subtitle"');
    expect(html).toContain('Doe v. Doe');
  });
});

// ═══════════════════════════════════════════════════════════════
// Visual Timeline Mode
// ═══════════════════════════════════════════════════════════════

describe('renderTimelineExportHTML — visual timeline mode', () => {
  it('renders vertical timeline wrapper when profile prefers visual', () => {
    // US profile should use visual timeline (timelineAsTable=false)
    const html = renderTimelineExportHTML(makeTimelineDoc(), usProfile);
    expect(html).toContain('class="timeline-wrapper"');
    expect(html).toContain('class="timeline-line"');
  });

  it('renders event cards with dots', () => {
    const html = renderTimelineExportHTML(makeTimelineDoc(), usProfile);
    expect(html).toContain('class="timeline-dot"');
    expect(html).toContain('class="timeline-event"');
  });

  it('renders event dates', () => {
    const html = renderTimelineExportHTML(makeTimelineDoc(), usProfile);
    expect(html).toContain('class="timeline-date"');
    expect(html).toContain('2025-06-15');
    expect(html).toContain('2025-08-01');
  });

  it('renders event titles', () => {
    const html = renderTimelineExportHTML(makeTimelineDoc(), usProfile);
    expect(html).toContain('class="timeline-event-title"');
    expect(html).toContain('Initial filing');
    expect(html).toContain('Hearing');
  });

  it('renders event descriptions', () => {
    const html = renderTimelineExportHTML(makeTimelineDoc(), usProfile);
    expect(html).toContain('class="timeline-description"');
    expect(html).toContain('Petition filed.');
  });

  it('renders source references', () => {
    const html = renderTimelineExportHTML(makeTimelineDoc(), usProfile);
    expect(html).toContain('class="timeline-sources"');
    expect(html).toContain('Email');
    expect(html).toContain('Court record');
  });
});

// ═══════════════════════════════════════════════════════════════
// Table Mode
// ═══════════════════════════════════════════════════════════════

describe('renderTimelineExportHTML — table mode', () => {
  it('renders table when profile prefers table mode', () => {
    // Federal profile uses table mode (timelineAsTable=true)
    const html = renderTimelineExportHTML(makeTimelineDoc(), fedProfile);
    expect(html).toContain('class="timeline-table"');
    expect(html).toContain('<thead>');
    expect(html).toContain('Date');
    expect(html).toContain('Event');
    expect(html).toContain('Description');
  });

  it('renders events as table rows', () => {
    const html = renderTimelineExportHTML(makeTimelineDoc(), fedProfile);
    expect(html).toContain('Initial filing');
    expect(html).toContain('Petition filed.');
    expect(html).toContain('2025-06-15');
  });
});

// ═══════════════════════════════════════════════════════════════
// Empty State
// ═══════════════════════════════════════════════════════════════

describe('renderTimelineExportHTML — edge cases', () => {
  it('handles empty events gracefully', () => {
    const doc = makeTimelineDoc({
      timelineVisual: { mode: 'summary', title: 'Empty', events: [] },
    });
    const html = renderTimelineExportHTML(doc, usProfile);
    expect(html).toContain('No timeline events available.');
  });

  it('extracts events from timeline sections when timelineVisual is absent', () => {
    const doc = makeTimelineDoc({
      timelineVisual: undefined,
      sections: [
        {
          kind: 'timeline_section',
          id: 'ts1',
          heading: 'Events',
          events: [{ date: '2026-01-01', title: 'Section Event', description: 'From sections.' }],
        },
      ],
    });
    const html = renderTimelineExportHTML(doc, usProfile);
    expect(html).toContain('Section Event');
    expect(html).toContain('From sections.');
  });

  it('renders incident_report path correctly', () => {
    const doc = makeTimelineDoc({ path: 'incident_report', title: 'INCIDENT REPORT' });
    const html = renderTimelineExportHTML(doc, usProfile);
    expect(html).toContain('INCIDENT REPORT');
    expect(html).toContain('class="timeline-wrapper"');
  });
});

// ═══════════════════════════════════════════════════════════════
// Profile Integration
// ═══════════════════════════════════════════════════════════════

describe('renderTimelineExportHTML — profile integration', () => {
  it('HTML exceeds minimum length', () => {
    const html = renderTimelineExportHTML(makeTimelineDoc(), usProfile);
    expect(html.length).toBeGreaterThan(200);
  });
});
