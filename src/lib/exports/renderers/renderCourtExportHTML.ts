/**
 * Court Export HTML Renderer
 *
 * Renders a court document CanonicalExportDocument into full HTML
 * with caption, title, body sections, prayer, signature, and certificate.
 *
 * Uses shared layout primitives from the export profile for page shell,
 * typography, and page break rules.
 */

import type { CanonicalExportDocument, CourtSection, ExportCaption } from '../types';
import type { ExportJurisdictionProfile } from '@/lib/jurisdiction/types';
import { escapeHtml, renderPageShell } from './shared';

// ═══════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════

/**
 * Render a court document export to HTML.
 *
 * @param doc - CanonicalExportDocument with path='court_document'
 * @param profile - Resolved export jurisdiction profile
 * @returns Complete HTML string ready for PDF rendering
 */
export function renderCourtExportHTML(
  doc: CanonicalExportDocument,
  profile: ExportJurisdictionProfile,
): string {
  const courtSections = doc.sections.filter(
    (s): s is CourtSection => s.kind === 'court_section',
  );

  const bodyHTML = [
    renderCaption(doc.caption, profile),
    `<div class="title">${escapeHtml(doc.title)}</div>`,
    doc.subtitle ? `<div class="subtitle">${escapeHtml(doc.subtitle)}</div>` : '',
    '<div class="rule"></div>',
    courtSections.map(renderCourtSection).join('\n'),
    renderSignature(doc),
    renderCertificate(doc),
    renderVerification(doc),
  ]
    .filter(Boolean)
    .join('\n');

  return renderPageShell({
    title: doc.title,
    profile,
    bodyHTML,
    extraCSS: COURT_CSS,
  });
}

// ═══════════════════════════════════════════════════════════════
// Caption
// ═══════════════════════════════════════════════════════════════

function renderCaption(
  caption: ExportCaption | null | undefined,
  profile: ExportJurisdictionProfile,
): string {
  if (!caption) return '';

  const textTransform = profile.typography.uppercaseCaption ? 'text-transform: uppercase;' : '';

  if (caption.style === 'texas_pleading') {
    return `
    <div class="caption-block" style="${textTransform}">
      ${caption.causeLine ? `<div class="caption-cause">${escapeHtml(caption.causeLine)}</div>` : ''}
      <table class="caption-table">
        <tr>
          <td class="caption-left">${caption.leftLines.map((l) => `<div>${escapeHtml(l)}</div>`).join('')}</td>
          <td class="caption-center">${caption.centerLines.map((l) => `<div>${escapeHtml(l)}</div>`).join('')}</td>
          <td class="caption-right">${caption.rightLines.map((l) => `<div>${escapeHtml(l)}</div>`).join('')}</td>
        </tr>
      </table>
    </div>`;
  }

  // Generic / federal caption
  return `
  <div class="caption-block" style="${textTransform}">
    ${caption.causeLine ? `<div class="caption-cause">${escapeHtml(caption.causeLine)}</div>` : ''}
    <table class="caption-table">
      <tr>
        <td class="caption-left">${caption.leftLines.map((l) => `<div>${escapeHtml(l)}</div>`).join('')}</td>
        <td class="caption-right">${caption.rightLines.map((l) => `<div>${escapeHtml(l)}</div>`).join('')}</td>
      </tr>
    </table>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// Court Sections
// ═══════════════════════════════════════════════════════════════

function renderCourtSection(section: CourtSection): string {
  const heading = section.heading
    ? `<div class="section-heading">${escapeHtml(section.heading)}</div>`
    : '';

  const paragraphs = (section.paragraphs ?? [])
    .map((p) => `<p class="body-paragraph">${escapeHtml(p)}</p>`)
    .join('\n');

  const numbered = (section.numberedItems ?? [])
    .map((item, idx) => `<p class="numbered-item">${idx + 1}. ${escapeHtml(item)}</p>`)
    .join('\n');

  const bullets = (section.bulletItems ?? [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('\n');
  const bulletBlock = bullets ? `<ul class="bullet-list">${bullets}</ul>` : '';

  return `${heading}\n${paragraphs}\n${numbered}\n${bulletBlock}`;
}

// ═══════════════════════════════════════════════════════════════
// Closing Blocks
// ═══════════════════════════════════════════════════════════════

function renderSignature(doc: CanonicalExportDocument): string {
  if (!doc.signature) return '';
  return `
  <div class="signature-block">
    ${doc.signature.intro ? `<p class="no-indent">${escapeHtml(doc.signature.intro)}</p>` : ''}
    <div style="margin-top: 24pt;">
      <div class="signature-rule"></div>
    </div>
    ${doc.signature.signerLines.map((l) => `<div class="no-indent">${escapeHtml(l)}</div>`).join('\n')}
  </div>`;
}

function renderCertificate(doc: CanonicalExportDocument): string {
  if (!doc.certificate) return '';
  return `
  <div class="certificate-block" style="page-break-before: always; break-before: page;">
    <div class="certificate-heading">${escapeHtml(doc.certificate.heading)}</div>
    ${doc.certificate.bodyLines.map((l) => `<p class="no-indent">${escapeHtml(l)}</p>`).join('\n')}
    <div class="certificate-signer">
      <div class="signature-rule"></div>
      ${doc.certificate.signerLines.map((l) => `<div class="no-indent">${escapeHtml(l)}</div>`).join('\n')}
    </div>
  </div>`;
}

function renderVerification(doc: CanonicalExportDocument): string {
  if (!doc.verification) return '';
  return `
  <div class="verification-block">
    ${doc.verification.heading ? `<div class="section-heading">${escapeHtml(doc.verification.heading)}</div>` : ''}
    ${doc.verification.bodyLines.map((l) => `<p>${escapeHtml(l)}</p>`).join('\n')}
    ${doc.verification.signerLines.map((l) => `<div>${escapeHtml(l)}</div>`).join('\n')}
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// Court-Specific CSS
// ═══════════════════════════════════════════════════════════════

const COURT_CSS = `
  .caption-block { margin-bottom: 18pt; }
  .caption-cause { text-align: right; margin-bottom: 10pt; font-weight: 700; text-indent: 0; }
  .caption-table { width: 100%; table-layout: fixed; border-collapse: collapse; }
  .caption-left { text-align: left; font-weight: 700; vertical-align: top; width: 40%; }
  .caption-center { text-align: center; vertical-align: top; width: 20%; }
  .caption-right { text-align: left; font-weight: 700; vertical-align: top; width: 40%; }

  .title {
    text-align: center;
    font-weight: 700;
    text-transform: uppercase;
    text-indent: 0;
    margin: 12pt 0;
  }
  .subtitle { text-align: center; text-indent: 0; margin-bottom: 12pt; }

  .rule { border-top: 1pt solid #000; margin: 12pt 0; }

  .section-heading {
    font-weight: 700;
    text-transform: uppercase;
    text-indent: 0;
    margin: 18pt 0 6pt;
  }

  .body-paragraph {
    text-indent: 0.5in;
    margin-bottom: 10pt;
  }
  .numbered-item { margin-bottom: 6pt; text-indent: 0; }
  .bullet-list { margin: 6pt 0 12pt 24pt; padding-left: 0; }
  .bullet-list li { margin-bottom: 6pt; }

  .no-indent { text-indent: 0; }

  .signature-block {
    margin-top: 40pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .signature-rule {
    display: inline-block;
    width: 3in;
    border-bottom: 1px solid #000;
    margin-bottom: 4pt;
  }

  .certificate-block {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .certificate-heading {
    font-weight: 700;
    text-transform: uppercase;
    text-align: center;
    text-indent: 0;
    margin-bottom: 12pt;
  }
  .certificate-signer { margin-top: 24pt; }

  .verification-block {
    page-break-inside: avoid;
    break-inside: avoid;
    margin-top: 24pt;
  }

  .page-break {
    page-break-before: always;
    break-before: page;
  }
`;
