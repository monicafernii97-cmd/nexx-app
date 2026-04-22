/**
 * Exhibit Packet HTML Renderer
 *
 * Renders a full exhibit packet with:
 * - Packet title page
 * - Exhibit index page
 * - Cover sheets per exhibit
 * - Text content pages
 * - Image/chart exhibit pages
 * - Stamped exhibit labels
 * - Bates numbering
 *
 * Each section starts on a new page via CSS page breaks.
 */

import type {
  CanonicalExportDocument,
  ExhibitChartSection,
  ExhibitContentSection,
  ExhibitCoverSection,
  ExhibitImageSection,
  ExhibitIndexSection,
} from '../types';
import type { ExportJurisdictionProfile } from '../jurisdiction/types';
import { formatBatesNumber } from '../bates/applyBatesNumbering';
import { getImageExhibitCSS, renderImageExhibitPages } from './renderImageExhibitPages';
import { escapeHtml, renderPageShell } from './shared';

// ═══════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════

/**
 * Render an exhibit packet export to HTML.
 *
 * @param doc - CanonicalExportDocument with path='exhibit_document'
 * @param profile - Resolved export jurisdiction profile
 * @returns Complete HTML string ready for PDF rendering
 */
export function renderExhibitPacketHTML(
  doc: CanonicalExportDocument,
  profile: ExportJurisdictionProfile,
): string {
  const batesConfig = doc.exhibitPacket?.bates ?? { enabled: false };

  // Extract typed sections
  const indexSection = doc.sections.find(
    (s): s is ExhibitIndexSection => s.kind === 'exhibit_index',
  );
  const covers = doc.sections.filter(
    (s): s is ExhibitCoverSection => s.kind === 'exhibit_cover',
  );
  const textContents = doc.sections.filter(
    (s): s is ExhibitContentSection => s.kind === 'exhibit_content',
  );
  const visualContents = doc.sections.filter(
    (s): s is ExhibitImageSection | ExhibitChartSection =>
      s.kind === 'exhibit_image' || s.kind === 'exhibit_chart',
  );

  let batesCounter = 0;

  // Build HTML fragments
  const titlePage = renderTitlePage(doc);
  const indexPage = indexSection ? renderIndexPage(indexSection) : '';

  const coverPages = covers
    .map((cover) => {
      const bates = batesConfig.enabled
        ? formatBatesNumber(batesCounter++, batesConfig)
        : '';
      return renderCoverPage(cover, bates);
    })
    .join('');

  const textPages = textContents
    .map((content) => {
      const bates = batesConfig.enabled
        ? formatBatesNumber(batesCounter++, batesConfig)
        : '';
      return renderContentPage(content, profile, bates);
    })
    .join('');

  const visualPages = renderImageExhibitPages({
    sections: visualContents,
    profile,
    batesEnabled: !!batesConfig.enabled,
    batesPrefix: batesConfig.prefix,
    batesStartNumber: batesConfig.startNumber,
    startingBatesIndex: batesCounter,
  });

  const bodyHTML = `${titlePage}${indexPage}${coverPages}${textPages}${visualPages}`;

  return renderPageShell({
    title: doc.title || 'Exhibit Packet',
    profile,
    bodyHTML,
    extraCSS: EXHIBIT_CSS + '\n' + getImageExhibitCSS(profile),
  });
}

// ═══════════════════════════════════════════════════════════════
// Page Renderers
// ═══════════════════════════════════════════════════════════════

function renderTitlePage(doc: CanonicalExportDocument): string {
  return `
  <div class="packet-title-page">
    <div class="packet-title">${escapeHtml(doc.exhibitPacket?.packetTitle || doc.title || 'Exhibit Packet')}</div>
    ${
      doc.metadata?.causeNumber
        ? `<div class="packet-subtitle">Cause No. ${escapeHtml(doc.metadata.causeNumber)}</div>`
        : ''
    }
    ${
      doc.metadata?.jurisdiction?.county || doc.metadata?.jurisdiction?.state
        ? `<div class="packet-subtitle">${escapeHtml(
            [doc.metadata.jurisdiction?.county, doc.metadata.jurisdiction?.state]
              .filter(Boolean)
              .join(', '),
          )}</div>`
        : ''
    }
  </div>`;
}

function renderIndexPage(indexSection: ExhibitIndexSection): string {
  return `
  <div class="page-break exhibit-index-page">
    <div class="index-title">${escapeHtml(indexSection.heading)}</div>
    <table class="index-table">
      <thead>
        <tr>
          <th style="width: 22%">Exhibit</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        ${indexSection.entries
          .map(
            (entry) => `
          <tr>
            <td>${escapeHtml(entry.label)}</td>
            <td>${escapeHtml(entry.description)}</td>
          </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}

function renderCoverPage(cover: ExhibitCoverSection, bates: string): string {
  return `
  <div class="page-break exhibit-cover-page">
    <div class="cover-title">${escapeHtml(cover.heading)}</div>
    ${cover.summaryLines
      .map((line) => `<div class="cover-summary-line">${escapeHtml(line)}</div>`)
      .join('')}
    ${bates ? `<div class="bates-number">${escapeHtml(bates)}</div>` : ''}
  </div>`;
}

function renderContentPage(
  content: ExhibitContentSection,
  profile: ExportJurisdictionProfile,
  bates: string,
): string {
  return `
  <div class="page-break exhibit-content-page">
    ${
      profile.exhibit.stampedTitleRequired
        ? `<div class="exhibit-stamp">${escapeHtml(content.stampedTitle || content.exhibitLabel)}</div>`
        : ''
    }
    ${content.heading ? `<div class="exhibit-heading">${escapeHtml(content.heading)}</div>` : ''}
    ${(content.paragraphs ?? [])
      .map((p) => `<div class="exhibit-paragraph">${escapeHtml(p)}</div>`)
      .join('')}
    ${bates ? `<div class="bates-number">${escapeHtml(bates)}</div>` : ''}
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// Exhibit-Specific CSS
// ═══════════════════════════════════════════════════════════════

const EXHIBIT_CSS = `
  .page-break { page-break-before: always; break-before: page; }

  .packet-title-page { text-align: center; margin-top: 120pt; }
  .packet-title {
    font-size: 16pt;
    font-weight: 700;
    text-transform: uppercase;
    margin-bottom: 18pt;
  }
  .packet-subtitle { margin-bottom: 14pt; }

  .exhibit-index-page, .exhibit-cover-page, .exhibit-content-page {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .index-title, .cover-title {
    text-align: center;
    font-weight: 700;
    text-transform: uppercase;
    margin-bottom: 18pt;
  }

  .index-table { width: 100%; border-collapse: collapse; }
  .index-table th, .index-table td {
    border: 1pt solid #000;
    padding: 6pt;
    vertical-align: top;
  }
  .index-table th {
    text-align: left;
    text-transform: uppercase;
    font-weight: 700;
  }

  .cover-summary-line { margin-bottom: 8pt; }

  .exhibit-stamp {
    text-align: right;
    font-weight: 700;
    text-transform: uppercase;
    margin-bottom: 10pt;
  }

  .bates-number {
    text-align: right;
    font-size: 10pt;
    margin-top: 18pt;
  }

  .exhibit-heading { font-weight: 700; margin-bottom: 10pt; }
  .exhibit-paragraph { margin-bottom: 10pt; }
`;
