/**
 * Image / Visual Exhibit Page Renderer
 *
 * Produces full-page exhibit pages for screenshots, photos, charts,
 * and document scans. Includes: stamped title, scaled image, caption,
 * source/date metadata, and Bates numbering.
 *
 * Used by the exhibit packet renderer for visual exhibit sections.
 */

import type { ExhibitChartSection, ExhibitImageSection } from '../types';
import type { ExportJurisdictionProfile } from '../jurisdiction/types';
import { formatBatesNumber } from '../bates/applyBatesNumbering';
import { escapeHtml, escapeAttribute } from './shared';

/** Union type for visual exhibit sections. */
type VisualSection = ExhibitImageSection | ExhibitChartSection;

// ═══════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════

/**
 * Render visual exhibit pages (images, charts) to HTML fragments.
 *
 * @returns HTML string fragment (no <html>/<head> wrapper — embedded in packet)
 */
export function renderImageExhibitPages(params: {
  sections: VisualSection[];
  profile: ExportJurisdictionProfile;
  batesEnabled: boolean;
  batesPrefix?: string;
  batesStartNumber?: number;
  startingBatesIndex?: number;
}): string {
  const {
    sections,
    profile,
    batesEnabled,
    batesPrefix,
    batesStartNumber,
    startingBatesIndex = 0,
  } = params;

  let localIndex = startingBatesIndex;

  return sections
    .map((section) => {
      const bates = batesEnabled
        ? formatBatesNumber(localIndex++, {
            enabled: true,
            prefix: batesPrefix,
            startNumber: batesStartNumber,
          })
        : '';

      return `
      <div class="page-break exhibit-visual-page">
        ${
          profile.exhibit.stampedTitleRequired
            ? `<div class="exhibit-stamp">${escapeHtml(section.stampedTitle || section.exhibitLabel)}</div>`
            : ''
        }

        ${section.heading ? `<div class="exhibit-heading">${escapeHtml(section.heading)}</div>` : ''}

        <div class="visual-frame">
          <img class="exhibit-image" src="${escapeAttribute(section.imagePath)}" alt="${escapeAttribute(
            section.heading || section.exhibitLabel,
          )}" />
        </div>

        ${section.caption ? `<div class="visual-caption">${escapeHtml(section.caption)}</div>` : ''}

        ${
          section.date || section.sourceType
            ? `<div class="visual-meta">${escapeHtml(
                [section.date, section.sourceType].filter(Boolean).join(' • '),
              )}</div>`
            : ''
        }

        ${bates ? `<div class="bates-number">${escapeHtml(bates)}</div>` : ''}
      </div>`;
    })
    .join('');
}

// ═══════════════════════════════════════════════════════════════
// CSS for Visual Exhibits
// ═══════════════════════════════════════════════════════════════

/** Get CSS rules for visual exhibit pages. */
export function getImageExhibitCSS(profile: ExportJurisdictionProfile): string {
  return `
  .exhibit-visual-page {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .visual-frame {
    width: 100%;
    text-align: center;
    margin: 10pt 0 12pt;
  }
  .exhibit-image {
    max-width: 100%;
    max-height: 620pt;
    object-fit: contain;
    border: 1pt solid #000;
    box-sizing: border-box;
  }
  .visual-caption {
    margin-top: 8pt;
    text-align: ${profile.typography.bodyAlign};
  }
  .visual-meta {
    margin-top: 4pt;
    font-size: ${Math.max(9, profile.typography.fontSizePt - 2)}pt;
  }`;
}
