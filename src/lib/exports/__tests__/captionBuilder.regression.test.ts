/**
 * Caption Builder Regression Tests
 *
 * Verifies Texas SAPCR, Texas general, federal, generic, and IN RE captions.
 * Updated for CaptionBuildResult return type and captionPetitionerName/captionRespondentName.
 */

import { describe, expect, it } from 'vitest';
import { buildExportCaption } from '../buildExportCaption';

describe('buildExportCaption', () => {
  it('builds Texas SAPCR caption with children', () => {
    const { caption } = buildExportCaption({
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
    expect(caption.rightLines).toContainEqual(expect.stringContaining('FORT BEND'));
  });

  it('builds Texas SAPCR caption with single child', () => {
    const { caption } = buildExportCaption({
      style: 'texas_pleading',
      causeNumber: '2026-CV-001',
      childrenNames: ['John Smith Jr.'],
      county: 'Harris',
    });

    expect(caption.leftLines).toContain('A CHILD');
    expect(caption.leftLines).toContain('JOHN SMITH JR.,');
  });

  it('wraps long Texas SAPCR child names and staggers right caption rows', () => {
    const { caption } = buildExportCaption({
      style: 'texas_pleading',
      causeNumber: '20-DCV-271717',
      courtName: 'District Court',
      judicialDistrict: '387th Judicial District',
      childrenNames: ['Amelia Sofia Fernandez Pugliese'],
      county: 'Fort Bend',
    });

    expect(caption.leftLines).toEqual([
      'IN THE INTEREST OF',
      'AMELIA SOFIA FERNANDEZ',
      'PUGLIESE,',
      'A CHILD',
    ]);
    expect(caption.rightLines).toEqual([
      'IN THE DISTRICT COURT',
      '',
      '387TH JUDICIAL DISTRICT',
      '',
      'FORT BEND COUNTY, TEXAS',
    ]);
    expect(caption.centerLines).toEqual(['§', '§', '§', '§', '§']);
  });

  it('builds Texas general caption without children', () => {
    const { caption } = buildExportCaption({
      style: 'texas_pleading',
      causeNumber: '2026-CV-001',
      captionPetitionerName: 'Jane Doe',
      captionRespondentName: 'John Smith',
      county: 'Harris',
    });

    expect(caption.leftLines[0]).toBe('JANE DOE');
    expect(caption.leftLines).toContain('VS.');
    expect(caption.leftLines).toContainEqual('JOHN SMITH');
    expect(caption.rightLines).toContainEqual(expect.stringContaining('HARRIS'));
  });

  it('builds federal caption', () => {
    const { caption } = buildExportCaption({
      style: 'federal_caption',
      causeNumber: '4:26-cv-00123',
      captionPetitionerName: 'Jane Doe',
      captionRespondentName: 'John Smith',
      courtName: 'U.S. District Court, Southern District of Texas',
    });

    expect(caption.style).toBe('federal_caption');
    expect(caption.causeLine).toContain('Civil Action');
    expect(caption.leftLines[0]).toBe('JANE DOE');
    expect(caption.leftLines[2]).toBe('v.');
    expect(caption.leftLines[4]).toBe('JOHN SMITH');
  });

  it('builds IN RE caption', () => {
    const { caption } = buildExportCaption({
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
    const { caption } = buildExportCaption({
      style: 'generic_state_caption',
      causeNumber: '2026-CV-001',
      captionPetitionerName: 'Jane Doe',
      captionRespondentName: 'John Smith',
    });

    expect(caption.style).toBe('generic_state_caption');
    expect(caption.leftLines[0]).toBe('JANE DOE');
    expect(caption.rightLines).toContain('v.');
    expect(caption.rightLines).toContain('JOHN SMITH');
  });

  it('uses placeholder when cause number is missing', () => {
    const { caption } = buildExportCaption({
      style: 'texas_pleading',
      captionPetitionerName: 'Jane Doe',
    });

    expect(caption.causeLine).toContain('_______________');
  });

  it('includes judicial district as separate line', () => {
    const { caption } = buildExportCaption({
      style: 'texas_pleading',
      causeNumber: '20-DCV-271717',
      judicialDistrict: '387th Judicial District',
      courtName: 'District Court',
      county: 'Fort Bend',
      captionPetitionerName: 'Jane Doe',
    });

    expect(caption.rightLines).toContainEqual(expect.stringContaining('387TH JUDICIAL DISTRICT'));
    expect(caption.rightLines).toContainEqual(expect.stringContaining('DISTRICT COURT'));
  });

  it('forces SAPCR caption when caseType indicates SAPCR', () => {
    const { caption } = buildExportCaption({
      style: 'generic_state_caption', // would normally be generic
      caseType: 'sapcr_modification',
      childrenNames: ['Amelia Sofia'],
      causeNumber: '20-DCV-271717',
      county: 'Fort Bend',
    });

    // Forced to texas_pleading SAPCR
    expect(caption.style).toBe('texas_pleading');
    expect(caption.leftLines).toContain('IN THE INTEREST OF');
  });

  it('returns validation errors for custom caption missing required fields', () => {
    const { validationErrors } = buildExportCaption({
      style: 'texas_pleading',
      customCaption: 'Some custom caption text',
      // No causeNumber, courtName, or county
    });

    expect(validationErrors.length).toBeGreaterThan(0);
    expect(validationErrors.some(e => e.field === 'causeNumber')).toBe(true);
    expect(validationErrors.some(e => e.field === 'courtName')).toBe(true);
    expect(validationErrors.some(e => e.field === 'county')).toBe(true);
  });

  it('uses CAUSE NO. label for Texas captions', () => {
    const { caption } = buildExportCaption({
      style: 'texas_pleading',
      causeNumber: '20-DCV-271717',
      captionPetitionerName: 'Jane Doe',
    });

    expect(caption.causeLine).toBe('CAUSE NO. 20-DCV-271717');
  });
});
