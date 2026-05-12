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

import type { LegalDocument, LegalBlock, InlineRun } from './types';
import type { QuickGenerateProfile as JurisdictionProfile } from '@/lib/jurisdiction/types';
import type { DocumentTypeProfile } from './document-type/profiles';

// ═══════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════

/**
 * Renders a normalized legal document into print-ready HTML.
 *
 * The output is deterministic and profile-driven so the PDF renderer can apply
 * jurisdiction-specific caption, typography, margin, and pagination rules.
 */
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
  @import url('https://fonts.googleapis.com/css2?family=Tinos:wght@400;700&display=swap');

  @page {
    size: ${pageSize};
    margin: ${m.top}pt ${m.right}pt ${m.bottom}pt ${m.left}pt;
  }

  html, body {
    margin: 0;
    padding: 0;
    font-family: ${legalFontFamily(profile.typography.fontFamily)};
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
    margin: 0;
  }

  /* ── Caption ── */
  .cause-line {
    text-align: center;
    font-weight: 700;
    ${profile.typography.uppercaseCaption ? 'text-transform: uppercase;' : ''}
    margin-bottom: 14pt;
    line-height: 15pt;
  }

  .caption-table {
    width: ${(profile.caption.leftWidthIn ?? 3.125) + (profile.caption.centerWidthIn ?? 0.083) + (profile.caption.rightWidthIn ?? 3.125)}in;
    max-width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin: 0 auto 10pt;
  }

  .caption-left,
  .caption-right,
  .caption-center {
    vertical-align: top;
    text-align: center;
    font-weight: 700;
    ${profile.typography.uppercaseCaption ? 'text-transform: uppercase;' : ''}
  }

  .caption-left { width: ${profile.caption.leftWidthIn ?? 3.125}in; }
  .caption-center { width: ${profile.caption.centerWidthIn ?? 0.083}in; }
  .caption-right { width: ${profile.caption.rightWidthIn ?? 3.125}in; }

  .caption-cell-line {
    display: block;
    min-height: 14.5pt;
    line-height: 14.5pt;
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
  .title-block {
    margin-bottom: 24pt;
  }

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
    font-weight: 600;
    font-size: ${Math.max(9, profile.typography.fontSizePt - 1)}pt;
    margin: 0 0 8pt;
  }

  /* ── Body ── */
  .body-paragraph {
    text-align: ${profile.typography.bodyAlign};
    text-indent: 0;
    margin: 0 0 11pt;
    orphans: 3;
    widows: 3;
  }

  .body-paragraph-intro {
    text-align: ${profile.typography.bodyAlign};
    text-indent: 0.5in;
    margin: 0 0 11pt;
    orphans: 3;
    widows: 3;
  }

  .salutation {
    font-weight: 700;
    margin: 0 0 12pt;
  }

  .section-heading {
    ${profile.typography.headingBold ? 'font-weight: 700;' : ''}
    ${profile.typography.uppercaseHeadings ? 'text-transform: uppercase;' : ''}
    text-align: left;
    margin: 18pt 0 8pt;
    page-break-after: avoid;
    break-after: avoid;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .subheading-inline {
    font-weight: 700;
    ${profile.typography.uppercaseHeadings ? 'text-transform: uppercase;' : ''}
    margin: 18pt 0 8pt;
    page-break-after: avoid;
    break-after: avoid;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .numbered-list {
    list-style: none;
    padding: 0;
    margin: 0 0 6pt;
  }

  .numbered-list li {
    margin: 0 0 11pt;
    padding-left: 0.25in;
    text-indent: -0.25in;
    text-align: ${profile.typography.bodyAlign};
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .numbered-paragraph {
    display: flex;
    align-items: flex-start;
    margin: 0 0 11pt;
    line-height: ${profile.typography.lineHeightPt}pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .section-heading + .body-paragraph,
  .section-heading + .numbered-paragraph,
  .section-heading + .numbered-list,
  .section-heading + .bullet-list,
  .section-heading + .lettered-list,
  .subheading-inline + .body-paragraph,
  .subheading-inline + .numbered-paragraph,
  .subheading-inline + .numbered-list,
  .subheading-inline + .bullet-list,
  .subheading-inline + .lettered-list,
  .prayer-heading + .body-paragraph,
  .prayer-heading + .numbered-list,
  .prayer-heading + .lettered-list,
  .certificate-heading + .body-paragraph {
    page-break-before: avoid;
    break-before: avoid;
  }

  .numbered-paragraph-number {
    width: 0.25in;
    flex-shrink: 0;
  }

  .numbered-paragraph-text {
    flex: 1;
    text-align: ${profile.typography.bodyAlign};
    text-transform: none;
  }

  .bullet-list {
    list-style: none;
    padding: 0;
    margin: 0 0 12pt;
  }

  .bullet-list li {
    margin: 0 0 11pt;
    padding-left: 18pt;
    text-indent: -18pt;
    text-align: ${profile.typography.bodyAlign};
    page-break-inside: avoid;
    break-inside: avoid;
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
    page-break-after: avoid;
    break-after: avoid;
  }

  .prayer-block {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* ── Signature ── */
  .signature-block {
    margin-top: 36pt;
  }

  .signature-line {
    margin: 0;
    text-indent: 0;
  }

  .signature-rule {
    display: inline-block;
    width: 3in;
    border-bottom: 1px solid #000;
    margin-bottom: 4pt;
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
    margin: 0 0 11pt;
    padding-left: 18pt;
    text-indent: -18pt;
    text-align: ${profile.typography.bodyAlign};
    page-break-inside: avoid;
    break-inside: avoid;
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
<body data-renderer="legal-document">
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
    <div class="title-block">
    <div class="rule"></div>
    <div class="title-main">${esc(doc.title.main)}</div>
    ${additionalLines}
    ${doc.title.subtitle ? `<div class="title-subtitle">${esc(formatTitleSubtitle(doc.title.subtitle))}</div>` : ''}
    <div class="rule"></div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// Intro Blocks
// ═══════════════════════════════════════════════════════════════

/**
 * Normalizes title subtitles to the parenthetical style expected in pleadings.
 */
function formatTitleSubtitle(subtitle: string): string {
  const trimmed = subtitle.trim();
  if (!trimmed) return '';
  return /^\(.+\)$/.test(trimmed) ? trimmed : `(${trimmed})`;
}

function renderIntroBlocks(doc: LegalDocument): string {
  if (!doc.introBlocks.length) return '';
  return doc.introBlocks.map(renderBlock).join('');
}

// ═══════════════════════════════════════════════════════════════
// Sections
// ═══════════════════════════════════════════════════════════════

function renderSections(doc: LegalDocument): string {
  return doc.sections.map((section) => {
    // Auto-number from ordinal + level when ordinal is set.
    // Clean heading text is stored without numerals (e.g. "BACKGROUND");
    // the renderer prepends the numeral here to prevent "I. I. BACKGROUND".
    let headingText = section.heading;
    if (section.ordinal != null && section.level === 'roman') {
      headingText = `${toRoman(section.ordinal)}. ${headingText}`;
    } else if (section.ordinal != null && section.level === 'letter') {
      headingText = `${indexToLetter(section.ordinal - 1)}. ${headingText}`;
    }
    // If ordinal is undefined, heading renders as-is (backward compatible).
    const heading = headingText
      ? `<div class="section-heading">${esc(headingText)}</div>`
      : '';

    return `${heading}${section.blocks.map(renderBlock).join('')}`;
  }).join('');
}

function renderBlock(block: LegalBlock): string {
  if (block.type === 'paragraph') {
    // Letter subheadings (A. ...) get inline bold treatment
    if (/^__ALPHA_HEADING__/.test(block.text)) {
      return `<div class="subheading-inline">${esc(block.text.replace('__ALPHA_HEADING__', ''))}</div>`;
    }
    if (/^[A-Z]\.\s+/.test(block.text)) {
      return `<div class="subheading-inline">${esc(block.text)}</div>`;
    }
    // Render with inline runs if available
    if (block.runs && block.runs.length > 0) {
      return `<p class="body-paragraph">${renderInlineRuns(block.runs)}</p>`;
    }
    return `<p class="body-paragraph">${esc(block.text)}</p>`;
  }

  if (block.type === 'numbered_paragraph') {
    const content = block.runs && block.runs.length > 0
      ? renderInlineRuns(block.runs)
      : esc(block.text);
    return `<div class="numbered-paragraph">
      <span class="numbered-paragraph-number">${esc(String(block.number))}.</span>
      <span class="numbered-paragraph-text">${content}</span>
    </div>`;
  }

  if (block.type === 'numbered_list') {
    return `
      <ol class="numbered-list">
        ${block.items.map((item: string, idx: number) => `<li>${idx + 1}. ${esc(item)}</li>`).join('')}
      </ol>`;
  }

  if (block.type === 'lettered_list') {
    return `
      <ol class="lettered-list">
        ${block.items.map((item: string, idx: number) => `<li>${indexToLetter(idx)}. ${esc(item)}</li>`).join('')}
      </ol>`;
  }

  // bullet_list
  return `
    <ul class="bullet-list">
      ${(block as { items: string[] }).items.map((item: string) => `<li>${esc(item)}</li>`).join('')}
    </ul>`;
}

// ═══════════════════════════════════════════════════════════════
// Prayer
// ═══════════════════════════════════════════════════════════════

function renderPrayer(doc: LegalDocument): string {
  if (!doc.prayer) return '';

  const introHtml = doc.prayer.introRuns && doc.prayer.introRuns.length > 0
    ? `<p class="body-paragraph">${renderInlineRuns(doc.prayer.introRuns)}</p>`
    : doc.prayer.intro ? `<p class="body-paragraph">${esc(doc.prayer.intro)}</p>` : '';

  return `
    <div class="prayer-block">
    <div class="prayer-heading">${esc(doc.prayer.heading)}</div>
    ${introHtml}
    ${doc.prayer.requests.length
      ? `<ol class="numbered-list">
          ${doc.prayer.requests.map((item: string, idx: number) => `<li>${idx + 1}. ${esc(item)}</li>`).join('')}
        </ol>`
      : ''}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// Signature
// ═══════════════════════════════════════════════════════════════

function renderSignature(doc: LegalDocument, profile: JurisdictionProfile): string {
  if (!doc.signature) return '';

  const keepClass = profile.sections.signatureKeepTogether ? ' no-break-inside' : '';

  return `
    <div class="signature-block${keepClass}">
      ${doc.signature.intro ? `<p class="body-paragraph" style="text-indent:0">${esc(doc.signature.intro)}</p>` : ''}
      <div style="margin-top: 24pt;">
        <span class="signature-rule"></span>
      </div>
      ${doc.signature.signerLines.map((line) => `<p class="signature-line">${esc(line)}</p>`).join('')}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// Certificate of Service
// ═══════════════════════════════════════════════════════════════

function renderCertificate(doc: LegalDocument): string {
  if (!doc.certificate) return '';

  return `
    <div class="certificate-of-service">
      <div class="certificate-heading">${esc(doc.certificate.heading)}</div>
      ${doc.certificate.bodyLines.map((line) => `<p class="body-paragraph" style="text-indent:0">${esc(line)}</p>`).join('')}
      <div class="signature-block">
        <div style="margin-top: 24pt;">
          <span class="signature-rule"></span>
        </div>
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

/** Convert 1-based number to Roman numeral: 1→I, 2→II, 4→IV, etc. */
function toRoman(num: number): string {
  const map: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let result = '';
  let remaining = num;
  for (const [value, symbol] of map) {
    while (remaining >= value) {
      result += symbol;
      remaining -= value;
    }
  }
  return result;
}

/**
 * Escapes untrusted text before inserting it into the legal document template.
 */
function esc(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds the PDF font stack used by legal documents.
 *
 * Vercel's Linux Chromium runtime may not have Microsoft Times New Roman
 * installed, so Texas-style pleadings keep Times New Roman first for local
 * Windows rendering and include Tinos as a metrically compatible web fallback.
 */
function legalFontFamily(profileFontFamily: string): string {
  const fallback = '"Times New Roman", Tinos, Times, serif';
  const trimmed = profileFontFamily.trim();
  if (!trimmed) return fallback;
  if (/\bTinos\b/.test(trimmed)) return trimmed;
  if (/Times New Roman/i.test(trimmed)) return fallback;
  return `${trimmed}, Tinos, Times, serif`;
}

/**
 * Render inline formatting runs (bold, italic, underline).
 * Used for legal emphasis patterns like COMES NOW and WHEREFORE.
 */
function renderInlineRuns(runs: InlineRun[]): string {
  return runs.map(run => {
    let html = esc(run.text);
    if (run.bold) html = `<strong>${html}</strong>`;
    if (run.italic) html = `<em>${html}</em>`;
    if (run.underline) html = `<u>${html}</u>`;
    return html;
  }).join('');
}
