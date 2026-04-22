/**
 * Image Exhibit Builder Regression Tests
 */

import { describe, expect, it } from 'vitest';
import { buildImageExhibits, type ImageExhibitInput } from '../exhibits/buildImageExhibits';

describe('buildImageExhibits', () => {
  const testImages: ImageExhibitInput[] = [
    {
      imagePath: '/uploads/screenshot1.png',
      title: 'AppClose Messages — March 2026',
      caption: 'Screenshot of messages showing custody discussion',
      date: '2026-03-01',
      sourceType: 'screenshot',
    },
    {
      imagePath: '/uploads/chart1.svg',
      title: 'Timeline of Incidents',
      caption: 'Generated chart',
      sourceType: 'chart',
    },
  ];

  it('builds cover + visual sections for each image', () => {
    const sections = buildImageExhibits(testImages, {
      labelStyle: 'alpha',
      startIndex: 0,
      includeCoverSheets: true,
    });

    // 2 images * 2 (cover + visual) = 4 sections
    expect(sections).toHaveLength(4);

    // First image: cover + exhibit_image
    expect(sections[0].kind).toBe('exhibit_cover');
    expect(sections[1].kind).toBe('exhibit_image');

    // Second image (chart): cover + exhibit_chart
    expect(sections[2].kind).toBe('exhibit_cover');
    expect(sections[3].kind).toBe('exhibit_chart');
  });

  it('skips covers when includeCoverSheets=false', () => {
    const sections = buildImageExhibits(testImages, {
      labelStyle: 'alpha',
      startIndex: 0,
      includeCoverSheets: false,
    });

    expect(sections).toHaveLength(2);
    expect(sections[0].kind).toBe('exhibit_image');
    expect(sections[1].kind).toBe('exhibit_chart');
  });

  it('uses correct labels with startIndex offset', () => {
    const sections = buildImageExhibits(testImages, {
      labelStyle: 'alpha',
      startIndex: 3,
      includeCoverSheets: false,
    });

    expect(sections[0].kind).toBe('exhibit_image');
    expect((sections[0] as { exhibitLabel: string }).exhibitLabel).toBe('D');

    expect(sections[1].kind).toBe('exhibit_chart');
    expect((sections[1] as { exhibitLabel: string }).exhibitLabel).toBe('E');
  });

  it('uses party_numeric labels', () => {
    const sections = buildImageExhibits([testImages[0]], {
      labelStyle: 'party_numeric',
      startIndex: 0,
      includeCoverSheets: true,
      partyName: 'Respondent',
    });

    expect(sections[0].kind).toBe('exhibit_cover');
    expect((sections[0] as { exhibitLabel: string }).exhibitLabel).toContain("RESPONDENT'S EXHIBIT 1");
  });
});
