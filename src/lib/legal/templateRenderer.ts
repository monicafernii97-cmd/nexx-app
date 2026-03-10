/**
 * HTML Template Renderer
 *
 * Assembles legal document HTML from templates + user data + court rules.
 * The resulting HTML is fed to Puppeteer for PDF rendering.
 *
 * Flow: Template sections → populate with user data → inject court rules as CSS vars → full HTML
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type {
  CourtFormattingRules,
  CaptionData,
  SignatureBlockData,
  DocumentTemplate,
  GeneratedSection,
  ExhibitEntry,
  TextExcerptExhibit,
} from './types';

// ── Load the CSS stylesheet ──────────────────────────────────
let cachedCSS: string | null = null;

function getLegalCSS(): string {
  if (!cachedCSS) {
    cachedCSS = readFileSync(
      join(process.cwd(), 'src/lib/legal/legalDocStyles.css'),
      'utf-8'
    );
  }
  return cachedCSS;
}

// ═══════════════════════════════════════════════════════════════
// CSS Variable Injection
// ═══════════════════════════════════════════════════════════════

/**
 * Convert CourtFormattingRules to CSS custom property overrides.
 */
function rulesToCSS(rules: CourtFormattingRules): string {
  return `
    :root {
      --page-width: ${rules.paperWidth}in;
      --page-height: ${rules.paperHeight}in;
      --margin-top: ${rules.marginTop}in;
      --margin-bottom: ${rules.marginBottom}in;
      --margin-left: ${rules.marginLeft}in;
      --margin-right: ${rules.marginRight}in;
      --font-family: '${rules.fontFamily}', Times, serif;
      --font-size: ${rules.fontSize}pt;
      --line-spacing: ${rules.lineSpacing};
      --body-alignment: ${rules.bodyAlignment};
      --paragraph-indent: ${rules.paragraphIndent}in;
      --footer-font-size: ${rules.footerFontSize}pt;
    }
  `;
}


// ═══════════════════════════════════════════════════════════════
// Caption Rendering
// ═══════════════════════════════════════════════════════════════

/**
 * Render the Texas-style § caption block.
 */
function renderSectionSymbolCaption(data: CaptionData): string {
  const maxRows = Math.max(data.leftLines.length, data.rightLines.length);
  let rows = '';

  for (let i = 0; i < maxRows; i++) {
    const left = data.leftLines[i] ?? '';
    const right = data.rightLines[i] ?? '';
    rows += `
      <tr>
        <td class="caption-left">${escapeHtml(left)}</td>
        <td class="caption-center">§</td>
        <td class="caption-right">${escapeHtml(right)}</td>
      </tr>`;
  }

  return `
    <div class="caption-block">
      <div class="cause-number">CAUSE NO. ${escapeHtml(data.causeNumber)}</div>
      <table class="caption-table">
        ${rows}
      </table>
    </div>`;
}

/**
 * Render a versus-style caption (used in most states outside TX).
 */
function renderVersusCaption(data: CaptionData): string {
  return `
    <div class="caption-versus">
      <div class="cause-number">CAUSE NO. ${escapeHtml(data.causeNumber)}</div>
      ${data.leftLines.map(l => `<div class="party-name">${escapeHtml(l)}</div>`).join('\n')}
      <div class="vs-line">v.</div>
      ${data.rightLines.map(l => `<div class="party-name">${escapeHtml(l)}</div>`).join('\n')}
    </div>`;
}

/**
 * Render the appropriate caption based on style.
 */
function renderCaption(data: CaptionData): string {
  if (data.style === 'section-symbol') {
    return renderSectionSymbolCaption(data);
  }
  return renderVersusCaption(data);
}


// ═══════════════════════════════════════════════════════════════
// Section Renderers
// ═══════════════════════════════════════════════════════════════

function renderTitle(titleText: string): string {
  return `
    <div class="title-block">
      <hr class="title-rule" />
      <div class="document-title">${escapeHtml(titleText)}</div>
      <hr class="title-rule" />
    </div>`;
}

function renderCourtAddress(): string {
  return `<div class="court-address">TO THE HONORABLE JUDGE OF SAID COURT:</div>`;
}

function renderIntroduction(content: string): string {
  return `<div class="body-paragraph">${content}</div>`;
}

function renderBodySections(sections: GeneratedSection[]): string {
  return sections
    .filter(s => s.sectionType === 'body_sections')
    .map(s => {
      let html = '';
      if (s.heading) {
        html += `<div class="section-heading">${escapeHtml(s.heading)}</div>`;
      }
      html += `<div class="body-paragraph">${s.content}</div>`;
      return html;
    })
    .join('\n');
}

function renderNumberedParagraphs(items: string[]): string {
  return items
    .map((item, i) => {
      return `<div class="numbered-paragraph"><span class="number">${i + 1}.</span> ${item}</div>`;
    })
    .join('\n');
}

function renderPrayer(content: string): string {
  return `
    <div class="prayer">
      <span class="formal-phrase">WHEREFORE, PREMISES CONSIDERED,</span> ${content}
    </div>`;
}

function renderSignatureBlock(data: SignatureBlockData): string {
  const alignClass = data.barNumber ? 'right-aligned' : '';
  const sigLine = data.electronicSignature
    ? `<div class="e-signature">/s/ ${escapeHtml(data.name)}</div>`
    : `<div class="signature-line">_________________________</div>`;

  let details = '';
  if (data.role) details += `<div>${escapeHtml(data.role)}</div>`;
  if (data.address) details += `<div>${escapeHtml(data.address)}</div>`;
  if (data.phone) details += `<div>${escapeHtml(data.phone)}</div>`;
  if (data.email) details += `<div>${escapeHtml(data.email)}</div>`;
  if (data.barNumber) details += `<div>Bar No. ${escapeHtml(data.barNumber)}</div>`;

  return `
    <div class="signature-block ${alignClass}">
      <div>Respectfully submitted,</div>
      ${sigLine}
      <div class="signature-name">${escapeHtml(data.name)}</div>
      <div class="signature-details">${details}</div>
    </div>`;
}

function renderCertificateOfService(
  serverName: string,
  servedParty: string,
  method: string = 'the electronic filing system'
): string {
  return `
    <div class="certificate-of-service">
      <div class="cos-title">CERTIFICATE OF SERVICE</div>
      <div class="cos-body">
        I certify that a true and correct copy of this document was served on
        ${escapeHtml(servedParty)} on this <span class="fill-blank-short"></span> day of
        <span class="fill-blank-short"></span>, <span class="fill-blank-short"></span>,
        via ${escapeHtml(method)}.
      </div>
      <div class="signature-block" style="margin-top: 24pt;">
        <div class="signature-line">_________________________</div>
        <div class="signature-name">${escapeHtml(serverName)}</div>
      </div>
    </div>`;
}

function renderJudgeSignature(): string {
  return `
    <div class="judge-signature">
      <div class="judge-signed-line">
        SIGNED on this <span class="fill-blank-short"></span> day of
        <span class="fill-blank-short"></span>, <span class="fill-blank-short"></span>.
      </div>
      <div>
        <div class="judge-sign-underline">&nbsp;</div>
      </div>
      <div class="judge-label">JUDGE PRESIDING</div>
    </div>`;
}

function renderApprovalLine(name: string, role: string): string {
  return `
    <div class="approval-block">
      <div class="approval-label">APPROVED AS TO FORM ONLY:</div>
      <div class="signature-line">_________________________</div>
      <div class="signature-name">${escapeHtml(name)}</div>
      <div class="signature-role">${escapeHtml(role)}</div>
    </div>`;
}

function renderNotaryBlock(): string {
  return `
    <div class="notary-block">
      <div class="notary-sworn">
        SWORN TO AND SUBSCRIBED before me on this <span class="fill-blank-short"></span> day of
        <span class="fill-blank-short"></span>, <span class="fill-blank-short"></span>.
      </div>
      <div>
        <div class="notary-sign-underline">&nbsp;</div>
      </div>
      <div class="notary-details">
        <div>Notary Public</div>
        <div>State of <span class="fill-blank-short"></span></div>
        <div>My Commission Expires: <span class="fill-blank-short"></span></div>
      </div>
    </div>`;
}

function renderHorizontalRule(): string {
  return '<hr class="title-rule" />';
}


// ═══════════════════════════════════════════════════════════════
// Exhibit Renderers
// ═══════════════════════════════════════════════════════════════

/**
 * Render an exhibit cover page
 */
export function renderExhibitCover(exhibit: ExhibitEntry): string {
  return `
    <div class="exhibit-cover">
      <div class="exhibit-label">${escapeHtml(exhibit.label)}</div>
      <div class="exhibit-title">${escapeHtml(exhibit.title)}</div>
      ${exhibit.summary ? `<div class="exhibit-description">${escapeHtml(exhibit.summary)}</div>` : ''}
    </div>`;
}

/**
 * Render an exhibit index / table of contents
 */
export function renderExhibitIndex(exhibits: ExhibitEntry[]): string {
  const entries = exhibits
    .map(e => {
      let entry = `<div class="exhibit-index-entry"><strong>${escapeHtml(e.label)}</strong> – ${escapeHtml(e.title)}`;
      if (e.batesStart && e.batesEnd) {
        entry += ` (${escapeHtml(e.batesStart)}–${escapeHtml(e.batesEnd)})`;
      }
      entry += '</div>';
      return entry;
    })
    .join('\n');

  return `
    <div class="exhibit-index">
      <div class="exhibit-index-title">EXHIBIT INDEX</div>
      ${entries}
    </div>`;
}

/**
 * Render a text message communication summary exhibit
 */
export function renderTextExcerptExhibit(exhibit: TextExcerptExhibit): string {
  const summaryPoints = exhibit.summaryPoints
    .map(p => `<li>${escapeHtml(p)}</li>`)
    .join('\n');

  const timelineRows = exhibit.timeline
    .map(t => `
      <tr>
        <td>${escapeHtml(t.date)}</td>
        <td>${escapeHtml(t.description)}${t.exhibitReference ? ` <em>(${escapeHtml(t.exhibitReference)})</em>` : ''}</td>
      </tr>`)
    .join('\n');

  const keyPointBoxes = exhibit.keyPoints
    .map(kp => {
      const boxClass = kp.type === 'records_reflect' ? 'records-reflect-box' : 'key-point-box';
      const labelClass = kp.type === 'records_reflect' ? 'records-reflect-label' : 'key-point-label';
      const label = kp.type === 'key_point' ? 'KEY POINT'
        : kp.type === 'records_reflect' ? 'RECORDS REFLECT'
        : 'PATTERN IDENTIFIED';

      return `
        <div class="${boxClass}">
          <div class="${labelClass}">${label}</div>
          <div class="key-point-content">${escapeHtml(kp.content)}</div>
          ${kp.pageReference ? `<div><em>${escapeHtml(kp.pageReference)}</em></div>` : ''}
        </div>`;
    })
    .join('\n');

  return `
    <div class="comm-summary">
      <div class="comm-summary-title">${escapeHtml(exhibit.exhibitLabel)}</div>
      <div class="comm-summary-subtitle">COMMUNICATION SUMMARY</div>
      <div class="body-paragraph">
        This exhibit contains excerpts of communication between the parties through the
        ${escapeHtml(exhibit.platform)} application (${escapeHtml(exhibit.dateRange)}).
      </div>

      <div class="comm-summary-label">The highlighted excerpts demonstrate:</div>
      <ol class="comm-summary-points">${summaryPoints}</ol>

      <div class="comm-summary-label">COMMUNICATION TIMELINE</div>
      <table class="timeline-table">
        <tr><th>Date</th><th>Description</th></tr>
        ${timelineRows}
      </table>

      ${keyPointBoxes}
    </div>`;
}


// ═══════════════════════════════════════════════════════════════
// Main Document Renderer
// ═══════════════════════════════════════════════════════════════

export interface RenderDocumentOptions {
  template: DocumentTemplate;
  caption: CaptionData;
  titleText: string;
  bodyContent: GeneratedSection[];
  petitioner: SignatureBlockData;
  respondentName?: string;
  exhibits?: ExhibitEntry[];
  rules: CourtFormattingRules;
  footerText?: string;
}

/**
 * Render a complete legal document as HTML.
 * This HTML is fed directly to Puppeteer for PDF conversion.
 */
export function renderDocumentHTML(options: RenderDocumentOptions): string {
  const {
    template,
    caption,
    titleText,
    bodyContent,
    petitioner,
    respondentName,
    exhibits,
    rules,
    footerText,
  } = options;

  // Build the body HTML from template sections
  const sectionHTML: string[] = [];

  for (const section of template.sections) {
    switch (section.type) {
      case 'caption':
        sectionHTML.push(renderCaption(caption));
        break;

      case 'title':
        sectionHTML.push(renderTitle(titleText));
        break;

      case 'court_address':
        sectionHTML.push(renderCourtAddress());
        break;

      case 'introduction': {
        const introContent = bodyContent.find(s => s.sectionType === 'introduction');
        if (introContent) {
          sectionHTML.push(renderIntroduction(introContent.content));
        }
        break;
      }

      case 'body_sections':
        sectionHTML.push(renderBodySections(bodyContent));
        break;

      case 'body_numbered': {
        const numbered = bodyContent.find(s => s.sectionType === 'body_numbered');
        if (numbered?.numberedItems) {
          sectionHTML.push(renderNumberedParagraphs(numbered.numberedItems));
        }
        break;
      }

      case 'prayer_for_relief': {
        const prayerContent = bodyContent.find(s => s.sectionType === 'prayer_for_relief');
        if (prayerContent) {
          sectionHTML.push(renderPrayer(prayerContent.content));
        }
        break;
      }

      case 'signature_block':
        sectionHTML.push(renderSignatureBlock(petitioner));
        break;

      case 'certificate_of_service':
        if (rules.requiresCertificateOfService) {
          sectionHTML.push(
            renderCertificateOfService(petitioner.name, respondentName ?? 'Respondent')
          );
        }
        break;

      case 'verification':
        if (rules.requiresVerification) {
          sectionHTML.push(renderNotaryBlock());
        }
        break;

      case 'judge_signature':
        sectionHTML.push(renderJudgeSignature());
        break;

      case 'approval_line':
        if (petitioner) {
          sectionHTML.push(renderApprovalLine(petitioner.name, petitioner.role));
        }
        break;

      case 'notary_block':
        sectionHTML.push(renderNotaryBlock());
        break;

      case 'horizontal_rule':
        sectionHTML.push(renderHorizontalRule());
        break;
    }
  }

  // Add exhibits if present
  if (exhibits && exhibits.length > 0) {
    sectionHTML.push('<div class="page-break"></div>');
    sectionHTML.push(renderExhibitIndex(exhibits));
    for (const exhibit of exhibits) {
      sectionHTML.push(renderExhibitCover(exhibit));
    }
  }

  // Footer
  const footerHTML = rules.footerEnabled && footerText
    ? `<div class="page-footer">${escapeHtml(footerText)}</div>`
    : '';

  // Assemble full HTML document
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(titleText)}</title>
  <style>
    ${getLegalCSS()}
    ${rulesToCSS(rules)}
  </style>
</head>
<body>
  ${sectionHTML.join('\n')}
  ${footerHTML}
</body>
</html>`;
}


// ═══════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
