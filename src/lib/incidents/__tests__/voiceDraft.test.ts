import { describe, expect, it } from 'vitest';
import { deriveIncidentVoiceDraft, extractIncidentPeople, trimIncidentLabel } from '../voiceDraft';

describe('incident voice draft helpers', () => {
  it('derives editable incident fields from dictated transcript text', () => {
    const draft = deriveIncidentVoiceDraft({
      transcript: 'Monica said the exchange happened at school. The child became upset afterward.',
      date: '2026-05-13',
      time: '18:30',
      witnesses: 'Amelia Fernandez',
      location: 'School pickup',
    });

    expect(draft.title).toBe('Monica said the exchange happened at school.');
    expect(draft.eventDate).toBe('2026-05-13');
    expect(draft.peopleInvolved).toContain('Amelia Fernandez');
    expect(draft.timelineDescription).toContain('School pickup');
  });

  it('keeps generated labels compact', () => {
    expect(trimIncidentLabel('One two three four five six seven eight nine ten', 18)).toBe('One two three four...');
  });

  it('extracts names conservatively from witnesses and transcript', () => {
    expect(extractIncidentPeople('Monica Fernandez met John Smith after school.', 'Amelia Sofia')).toEqual([
      'Amelia Sofia',
      'Monica Fernandez',
      'John Smith',
    ]);
  });
});
