/**
 * Timeline Builder Regression Tests
 *
 * Verifies deduplication, chronological sorting, and date parsing.
 */

import { describe, expect, it } from 'vitest';
import { buildIncidentTimeline, type RawTimelineEvent } from '../timeline/buildIncidentTimeline';

describe('buildIncidentTimeline', () => {
  it('returns empty array for empty input', () => {
    expect(buildIncidentTimeline([])).toEqual([]);
  });

  it('deduplicates events by title + date (case-insensitive)', () => {
    const events: RawTimelineEvent[] = [
      { date: '2026-03-01', title: 'Incident at school' },
      { date: '2026-03-01', title: 'Incident at school' },
      { date: '2026-03-01', title: 'INCIDENT AT SCHOOL' },
      { date: '2026-03-01', title: 'Different event' },
    ];

    const result = buildIncidentTimeline(events);
    expect(result).toHaveLength(2);
  });

  it('sorts events chronologically', () => {
    const events: RawTimelineEvent[] = [
      { date: '2026-03-15', title: 'Later event' },
      { date: '2026-01-01', title: 'Early event' },
      { date: '2026-02-10', title: 'Middle event' },
    ];

    const result = buildIncidentTimeline(events);
    expect(result[0].title).toBe('Early event');
    expect(result[1].title).toBe('Middle event');
    expect(result[2].title).toBe('Later event');
  });

  it('sends dateless events to end', () => {
    const events: RawTimelineEvent[] = [
      { title: 'No date' },
      { date: '2026-01-01', title: 'Has date' },
    ];

    const result = buildIncidentTimeline(events);
    expect(result[0].title).toBe('Has date');
    expect(result[1].title).toBe('No date');
  });

  it('preserves source refs', () => {
    const events: RawTimelineEvent[] = [
      { date: '2026-03-01', title: 'Event', sourceRefs: ['Exhibit A', 'Exhibit B'] },
    ];

    const result = buildIncidentTimeline(events);
    expect(result[0].sourceRefs).toEqual(['Exhibit A', 'Exhibit B']);
  });

  it('handles partial dates with year extraction', () => {
    const events: RawTimelineEvent[] = [
      { date: 'Spring 2025', title: 'Old event' },
      { date: '2026-03-01', title: 'New event' },
    ];

    const result = buildIncidentTimeline(events);
    expect(result[0].title).toBe('Old event');
    expect(result[1].title).toBe('New event');
  });
});
