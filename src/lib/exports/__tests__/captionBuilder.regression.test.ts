/**
 * Caption Builder Regression Tests
 *
 * Verifies Texas SAPCR, Texas general, federal, generic, and IN RE captions.
 */

import { describe, expect, it } from 'vitest';
import { buildExportCaption } from '../buildExportCaption';

describe('buildExportCaption', () => {
  it('builds Texas SAPCR caption with children', () => {
    const caption = buildExportCaption({
      style: 'texas_pleading',
      causeNumber: '2026-CV-001',
      childrenNames: ['John Smith Jr.', 'Jane Smith'],
      county: 'Fort Bend',
    });

    expect(caption.style).toBe('texas_pleading');
    expect(caption.leftLines).toContain('IN THE INTEREST OF');
    expect(caption.leftLines).toContain('JOHN SMITH JR.');
    expect(caption.leftLines).toContain('CHILDREN');
    expect(caption.centerLines).toEqual(['§', '§', '§', '§']);
    expect(caption.rightLines[1]).toContain('FORT BEND');
  });

  it('builds Texas SAPCR caption with single child', () => {
    const caption = buildExportCaption({
      style: 'texas_pleading',
      causeNumber: '2026-CV-001',
      childrenNames: ['John Smith Jr.'],
      county: 'Harris',
    });

    expect(caption.leftLines).toContain('A CHILD');
  });

  it('builds Texas general caption without children', () => {
    const caption = buildExportCaption({
      style: 'texas_pleading',
      causeNumber: '2026-CV-001',
      petitionerName: 'Jane Doe',
      county: 'Harris',
    });

    expect(caption.leftLines[0]).toBe('JANE DOE');
    expect(caption.centerLines).toContain('VS.');
    expect(caption.rightLines[1]).toContain('HARRIS');
  });

  it('builds federal caption', () => {
    const caption = buildExportCaption({
      style: 'federal_caption',
      causeNumber: '4:26-cv-00123',
      petitionerName: 'Jane Doe',
      respondentName: 'John Smith',
      courtName: 'U.S. District Court, Southern District of Texas',
    });

    expect(caption.style).toBe('federal_caption');
    expect(caption.causeLine).toContain('Civil Action');
    expect(caption.leftLines[0]).toBe('JANE DOE');
    expect(caption.leftLines[2]).toBe('v.');
    expect(caption.leftLines[4]).toBe('JOHN SMITH');
  });

  it('builds IN RE caption', () => {
    const caption = buildExportCaption({
      style: 'in_re_caption',
      causeNumber: '2026-CV-001',
      childrenNames: ['John Smith Jr.'],
      courtName: 'District Court',
    });

    expect(caption.style).toBe('in_re_caption');
    expect(caption.leftLines[0]).toBe('IN RE:');
    expect(caption.leftLines[1]).toBe('JOHN SMITH JR.');
  });

  it('builds generic state caption', () => {
    const caption = buildExportCaption({
      style: 'generic_state_caption',
      causeNumber: '2026-CV-001',
      petitionerName: 'Jane Doe',
      respondentName: 'John Smith',
    });

    expect(caption.style).toBe('generic_state_caption');
    expect(caption.leftLines[0]).toBe('JANE DOE');
    expect(caption.rightLines).toContain('v.');
    expect(caption.rightLines).toContain('JOHN SMITH');
  });

  it('uses placeholder when cause number is missing', () => {
    const caption = buildExportCaption({
      style: 'texas_pleading',
      petitionerName: 'Jane Doe',
    });

    expect(caption.causeLine).toContain('_______________');
  });
});
