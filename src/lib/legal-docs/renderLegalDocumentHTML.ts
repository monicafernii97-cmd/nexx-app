/**
 * Jurisdiction-Aware Legal Document HTML Renderer
 *
 * Renders a parsed LegalDocument into deterministic HTML
 * driven entirely by a JurisdictionProfile.
 *
 * Renderer responsibilities:
 *   - Caption layout (3-column table vs generic stacked)
 *   - Title + subtitle between horizontal rules
 *   - Section headings (bold/uppercase per profile)
 *   - Body blocks: paragraphs, numbered lists, bullet lists
 *   - PRAYER heading + intro + requests
 *   - Signature block (keep-together per profile)
 *   - Certificate of Service (page-break per profile)
 *   - All CSS values driven by profile
 *
 * Non-negotiable rendering rules:
 *   - Bold: cause line, caption, title, Roman headings,
 *     letter subheadings, PRAYER, CERTIFICATE OF SERVICE
 *   - Not bold: normal body text, numbered list items
 *   - Times New Roman 12pt / 18pt line height (unless profile overrides)
 */

import type { LegalDocument, LegalBlock } from './types';
import type { QuickGenerateProfile as JurisdictionProfile } from './jurisdiction/types';
import type { DocumentTypeProfile } from './document-type/profiles';

// ═══════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════

export function renderLegalDocumentHTML(
  doc: LegalDocument,
  profile: JurisdictionProfile,
  // Reserved for future document-type-specific rendering rules
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _documentTypeProfile?: DocumentTypeProfile,
): string {
  const pageSize = profile.page.size === 'Legal'
    ? '8.5in 14in'
    : profile.page.size === 'A4'
      ? '210mm 297mm'
      : '8.5in 11in';
  const m = profile.page.marginsPt;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${esc(doc.title.main)}</title>
<style>
  @page {
    size: ${pageSize};
    margin: ${m.top}pt ${m.right}pt ${m.bottom}pt ${m.left}pt;
  }

  html, body {
    margin: 0;
    padding: 0;
    font-family: ${profile.typography.fontFamily};
    font-size: ${profile.typography.fontSizePt}pt;
    line-height: ${profile.typography.lineHeightPt}pt;
    color: #000;
  }

  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .document {
    width: 100%;
  }

  /* ── Caption ── */
  .cause-line {
    text-align: center;
    font-weight: 700;
    ${profile.typography.uppercaseCaption ? 'text-transform: uppercase;' : ''}
    margin-bottom: 12pt;
  }

  .caption-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-bottom: 14pt;
  }

  .caption-left,
  .caption-right,
  .caption-center {
    vertical-align: middle;
    text-align: center;
    font-weight: 700;
    ${profile.typography.uppercaseCaption ? 'text-transform: uppercase;' : ''}
  }

  .caption-left { width: ${profile.caption.leftWidthIn ?? 3.125}in; }
  .caption-center { width: ${profile.caption.centerWidthIn ?? 0.083}in; }
  .caption-right { width: ${profile.caption.rightWidthIn ?? 3.125}in; }

  .caption-cell-line {
    display: block;
    min-height: ${profile.typography.lineHeightPt}pt;
  }

  .caption-generic {
    margin-bottom: 14pt;
  }

  .caption-generic-line {
    text-align: center;
    font-weight: 700;
    ${profile.typography.uppercaseCaption ? 'text-transform: uppercase;' : ''}
    margin: 0;
  }

  /* ── Title ── */
  .rule {
    border-top: 1px solid #000;
    margin: 10pt 0;
  }

  .title-main {
    text-align: center;
    font-weight: 700;
    ${profile.typography.uppercaseTitle ? 'text-transform: uppercase;' : ''}
    margin: 8pt 0 4pt;
  }

  .title-subtitle {
    text-align: center;
    font-weight: normal;
    margin: 0 0 8pt;
  }

  /* ── Body ── */
  .body-paragraph {
    text-align: ${profile.typography.bodyAlign};
    margin: 0 0 12pt;
  }

  .section-heading {
    ${profile.typography.headingBold ? 'font-weight: 700;' : ''}
    ${profile.typography.uppercaseHeadings ? 'text-transform: uppercase;' : ''}
    text-align: left;
    margin: 16pt 0 6pt;
  }

  .subheading-inline {
    font-weight: 700;
    ${profile.typography.uppercaseHeadings ? 'text-transform: uppercase;' : ''}
    margin: 14pt 0 6pt;
  }

  .numbered-list {
    list-style: none;
    padding: 0;
    margin: 0 0 12pt;
  }

  .numbered-list li {
    margin: 0 0 6pt;
    padding-left: 18pt;
    text-indent: -18pt;
    text-align: ${profile.typography.bodyAlign};
  }

  .bullet-list {
    list-style: none;
    padding: 0;
    margin: 0 0 12pt;
  }

  .bullet-list li {
    margin: 0 0 6pt;
    padding-left: 18pt;
    text-indent: -18pt;
    text-align: ${profile.typography.bodyAlign};
  }

  .bullet-list li::before {
    content: "\\2022\\0020";
  }

  /* ── Prayer / Certificate ── */
  .prayer-heading,
  .certificate-heading {
    font-weight: 700;
    ${profile.typography.uppercaseHeadings ? 'text-transform: uppercase;' : ''}
    text-align: left;
    margin: 16pt 0 6pt;
  }

  /* ── Signature ── */
  .signature-block {
    margin-top: 18pt;
  }

  .signature-line {
    margin: 0;
  }

  /* ── Certificate page break ── */
  .certificate-of-service {
    ${profile.sections.certificateSeparatePage ? 'page-break-before: always; break-before: page;' : ''}
  }

  .no-break-inside {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* ── Lettered list ── */
  .lettered-list {
    list-style: none;
    padding: 0;
    margin: 0 0 12pt;
  }

  .lettered-list li {
    margin: 0 0 6pt;
    padding-left: 18pt;
    text-indent: -18pt;
    text-align: ${profile.typography.bodyAlign};
  }

  /* ── Verification ── */
  .verification-heading {
    font-weight: 700;
    ${profile.typography.uppercaseHeadings ? 'text-transform: uppercase;' : ''}
    text-align: left;
    margin: 16pt 0 6pt;
  }
</style>
</head>
<body>
  <div class="document">
    ${renderCaption(doc, profile)}
    ${renderTitle(doc)}
    ${renderIntroBlocks(doc)}
    ${renderSections(doc)}
    ${renderPrayer(doc)}
    ${renderSignature(doc, profile)}
    ${renderVerification(doc, profile)}
    ${renderCertificate(doc, profile)}
  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════
// Caption
// ═══════════════════════════════════════════════════════════════

function renderCaption(doc: LegalDocument, profile: JurisdictionProfile): string {
  if (!doc.caption) return '';

  // Texas-style 3-column caption table
  if (profile.caption.useThreeColumnTable) {
    const maxRows = Math.max(
      doc.caption.leftLines.length,
      doc.caption.centerLines.length,
      doc.caption.rightLines.length,
    );

    const left = [...doc.caption.leftLines];
    const center = doc.caption.centerLines.length
      ? [...doc.caption.centerLines]
      : Array(maxRows).fill(profile.caption.centerSymbol || '§');
    const right = [...doc.caption.rightLines];

    while (left.length < maxRows) left.push('');
    while (center.length < maxRows) center.push(profile.caption.centerSymbol || '§');
    while (right.length < maxRows) right.push('');

    const rows = Array.from({ length: maxRows }, (_, idx) => `
      <tr>
        <td class="caption-left"><span class="caption-cell-line">${esc(left[idx] || '')}</span></td>
        <td class="caption-center"><span class="caption-cell-line">${esc(center[idx] || '')}</span></td>
        <td class="caption-right"><span class="caption-cell-line">${esc(right[idx] || '')}</span></td>
      </tr>`).join('');

    return `
    ${doc.caption.causeLine ? `<div class="cause-line">${esc(doc.caption.causeLine)}</div>` : ''}
    <table class="caption-table" aria-label="caption">
      <tbody>${rows}</tbody>
    </table>`;
  }

  // Generic stacked caption
  return `
    ${doc.caption.causeLine ? `<div class="cause-line">${esc(doc.caption.causeLine)}</div>` : ''}
    <div class="caption-generic">
      ${doc.caption.leftLines.map((line) => `<p class="caption-generic-line">${esc(line)}</p>`).join('')}
      ${doc.caption.rightLines.map((line) => `<p class="caption-generic-line">${esc(line)}</p>`).join('')}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// Title
// ═══════════════════════════════════════════════════════════════

function renderTitle(doc: LegalDocument): string {
  const additionalLines = doc.title.additionalTitleLines?.length
    ? doc.title.additionalTitleLines.map(l => `<div class="title-main">${esc(l)}</div>`).join('')
    : '';

  return `
    <div class="rule"></div>
    <div class="title-main">${esc(doc.title.main)}</div>
    ${additionalLines}
    ${doc.title.subtitle ? `<div class="title-subtitle">${esc(doc.title.subtitle)}</div>` : ''}
    <div class="rule"></div>`;
}

// ═══════════════════════════════════════════════════════════════
// Intro Blocks
// ═══════════════════════════════════════════════════════════════

function renderIntroBlocks(doc: LegalDocument): string {
  if (!doc.introBlocks.length) return '';
  return doc.introBlocks.map(renderBlock).join('');
}

// ═══════════════════════════════════════════════════════════════
// Sections
// ═══════════════════════════════════════════════════════════════

function renderSections(doc: LegalDocument): string {
  return doc.sections.map((section) => {
    const heading = section.heading
      ? `<div class="section-heading">${esc(section.heading)}</div>`
      : '';

    return `${heading}${section.blocks.map(renderBlock).join('')}`;
  }).join('');
}

function renderBlock(block: LegalBlock): string {
  if (block.type === 'paragraph') {
    // Letter subheadings (A. ...) get inline bold treatment
    if (/^[A-Z]\.\s+/.test(block.text)) {
      return `<div class="subheading-inline">${esc(block.text)}</div>`;
    }
    return `<p class="body-paragraph">${esc(block.text)}</p>`;
  }

  if (block.type === 'numbered_list') {
    return `
      <ol class="numbered-list">
        ${block.items.map((item, idx) => `<li>${idx + 1}. ${esc(item)}</li>`).join('')}
      </ol>`;
  }

  if (block.type === 'lettered_list') {
    return `
      <ol class="lettered-list">
        ${block.items.map((item, idx) => `<li>${indexToLetter(idx)}. ${esc(item)}</li>`).join('')}
      </ol>`;
  }

  // bullet_list
  return `
    <ul class="bullet-list">
      ${block.items.map((item) => `<li>${esc(item)}</li>`).join('')}
    </ul>`;
}

// ═══════════════════════════════════════════════════════════════
// Prayer
// ═══════════════════════════════════════════════════════════════

function renderPrayer(doc: LegalDocument): string {
  if (!doc.prayer) return '';

  return `
    <div class="prayer-heading">${esc(doc.prayer.heading)}</div>
    ${doc.prayer.intro ? `<p class="body-paragraph">${esc(doc.prayer.intro)}</p>` : ''}
    ${doc.prayer.requests.length
      ? `<ol class="numbered-list">
          ${doc.prayer.requests.map((item, idx) => `<li>${idx + 1}. ${esc(item)}</li>`).join('')}
        </ol>`
      : ''}`;
}

// ═══════════════════════════════════════════════════════════════
// Signature
// ═══════════════════════════════════════════════════════════════

function renderSignature(doc: LegalDocument, profile: JurisdictionProfile): string {
  if (!doc.signature) return '';

  const keepClass = profile.sections.signatureKeepTogether ? ' no-break-inside' : '';

  return `
    <div class="signature-block${keepClass}">
      ${doc.signature.intro ? `<p class="body-paragraph">${esc(doc.signature.intro)}</p>` : ''}
      ${doc.signature.signerLines.map((line) => `<p class="signature-line">${esc(line)}</p>`).join('')}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// Certificate of Service
// ═══════════════════════════════════════════════════════════════

function renderCertificate(doc: LegalDocument, profile: JurisdictionProfile): string {
  if (!doc.certificate) return '';

  const pageClass = profile.sections.certificateSeparatePage ? 'certificate-of-service' : '';

  return `
    <div class="${pageClass}">
      <div class="certificate-heading">${esc(doc.certificate.heading)}</div>
      ${doc.certificate.bodyLines.map((line) => `<p class="body-paragraph">${esc(line)}</p>`).join('')}
      <div class="signature-block">
        ${doc.certificate.signerLines.map((line) => `<p class="signature-line">${esc(line)}</p>`).join('')}
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// Verification
// ═══════════════════════════════════════════════════════════════

function renderVerification(doc: LegalDocument, profile: JurisdictionProfile): string {
  if (!doc.verification) return '';

  const keepClass = profile.sections.verificationKeepTogether ? ' no-break-inside' : '';

  return `
    <div class="${keepClass}">
      ${doc.verification.heading ? `<div class="verification-heading">${esc(doc.verification.heading)}</div>` : ''}
      ${doc.verification.bodyLines.map((line) => `<p class="body-paragraph">${esc(line)}</p>`).join('')}
      <div class="signature-block">
        ${doc.verification.signerLines.map((line) => `<p class="signature-line">${esc(line)}</p>`).join('')}
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Convert 0-based index to Excel-style letter label: 0→A, 25→Z, 26→AA, 27→AB, etc. */
function indexToLetter(idx: number): string {
  let label = '';
  let n = idx;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

function esc(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
