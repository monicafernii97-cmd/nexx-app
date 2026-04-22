/**
 * Image Exhibit Builder
 *
 * Converts uploaded screenshots, photos, charts, and document scans
 * into exhibit cover + visual content sections for the canonical model.
 */

import type {
  ExhibitImageSection,
  ExhibitChartSection,
  ExhibitCoverSection,
  ExportSection,
} from '../types';
import { formatExhibitLabel, type ExhibitLabelStyle } from './formatExhibitLabel';

// ═══════════════════════════════════════════════════════════════
// Input
// ═══════════════════════════════════════════════════════════════

/** A single image/chart exhibit input. */
export type ImageExhibitInput = {
  imagePath: string;
  title: string;
  caption?: string;
  date?: string;
  sourceType?: 'screenshot' | 'photo' | 'chart' | 'document_scan';
};

/** Configuration for image exhibit building. */
export type ImageExhibitBuildConfig = {
  labelStyle: ExhibitLabelStyle;
  startIndex: number;
  includeCoverSheets: boolean;
  partyName?: string;
};

// ═══════════════════════════════════════════════════════════════
// Builder
// ═══════════════════════════════════════════════════════════════

/**
 * Build exhibit sections from image inputs.
 *
 * @param images - Image/chart exhibit inputs
 * @param config - Build configuration
 * @returns Array of ExportSections (covers + visual pages)
 */
export function buildImageExhibits(
  images: ImageExhibitInput[],
  config: ImageExhibitBuildConfig,
): ExportSection[] {
  const sections: ExportSection[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const idx = config.startIndex + i;
    const label = formatExhibitLabel(idx, config.labelStyle, config.partyName);
    const isChart = img.sourceType === 'chart';

    // Cover sheet
    if (config.includeCoverSheets) {
      const coverSection: ExhibitCoverSection = {
        kind: 'exhibit_cover',
        id: `cover_${label}`,
        heading: `EXHIBIT ${label}`,
        exhibitLabel: label,
        summaryLines: [
          img.title,
          ...(img.date ? [`Date: ${img.date}`] : []),
          ...(img.sourceType ? [`Type: ${img.sourceType}`] : []),
        ],
        sourceType: img.sourceType,
        dateRange: img.date,
      };
      sections.push(coverSection);
    }

    // Visual page
    if (isChart) {
      const chartSection: ExhibitChartSection = {
        kind: 'exhibit_chart',
        id: `chart_${label}`,
        exhibitLabel: label,
        heading: img.title,
        imagePath: img.imagePath,
        caption: img.caption,
        sourceType: img.sourceType,
        stampedTitle: `EXHIBIT ${label}`,
        date: img.date,
      };
      sections.push(chartSection);
    } else {
      const imageSection: ExhibitImageSection = {
        kind: 'exhibit_image',
        id: `image_${label}`,
        exhibitLabel: label,
        heading: img.title,
        imagePath: img.imagePath,
        caption: img.caption,
        sourceType: img.sourceType,
        stampedTitle: `EXHIBIT ${label}`,
        date: img.date,
      };
      sections.push(imageSection);
    }
  }

  return sections;
}
