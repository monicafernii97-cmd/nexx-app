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
import createDOMPurify from 'dompurify';
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

/** Load and cache the legal document CSS stylesheet from disk. */
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

/** Allowed font families — prevents CSS injection via fontFamily field. */
const ALLOWED_FONTS: Record<string, string> = {
  'Times New Roman': "'Times New Roman', times, serif",
  'Arial': "Arial, Helvetica, sans-serif",
  'Courier New': "'Courier New', Courier, monospace",
  'Georgia': "Georgia, times, serif",
  'Garamond': "Garamond, times, serif",
};

/** Validate a numeric value is a finite number within a sane range, or return the fallback. */
function safeNum(value: unknown, fallback: number, min = 0, max = 100): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

/** Validate alignment is one of the allowed values. */
function safeAlignment(value: string): string {
  const allowed = ['left', 'right', 'center', 'justify'];
  return allowed.includes(value) ? value : 'left';
}

/**
 * Convert CourtFormattingRules to CSS custom property overrides.
 * Validates and sanitizes all values before interpolation to prevent
 * CSS injection when Puppeteer loads the HTML.
 */
function rulesToCSS(rules: CourtFormattingRules): string {
  const fontStack = ALLOWED_FONTS[rules.fontFamily] ?? ALLOWED_FONTS['Times New Roman'];

  // Compute caption column width percentages from inch values
  const totalCaptionWidth = (rules.captionColumnWidths?.left ?? 3.125)
    + (rules.captionColumnWidths?.center ?? 0.083)
    + (rules.captionColumnWidths?.right ?? 3.125);
  const leftPct = ((rules.captionColumnWidths?.left ?? 3.125) / totalCaptionWidth * 100).toFixed(1);
  const centerPct = ((rules.captionColumnWidths?.center ?? 0.083) / totalCaptionWidth * 100).toFixed(1);
  const rightPct = ((rules.captionColumnWidths?.right ?? 3.125) / totalCaptionWidth * 100).toFixed(1);

  return `
    :root {
      --page-width: ${safeNum(rules.paperWidth, 8.5, 1, 20)}in;
      --page-height: ${safeNum(rules.paperHeight, 11, 1, 20)}in;
      --margin-top: ${safeNum(rules.marginTop, 1.0, 0, 5)}in;
      --margin-bottom: ${safeNum(rules.marginBottom, 1.0, 0, 5)}in;
      --margin-left: ${safeNum(rules.marginLeft, 1.0, 0, 5)}in;
      --margin-right: ${safeNum(rules.marginRight, 1.0, 0, 5)}in;
      --font-family: ${fontStack};
      --font-size: ${safeNum(rules.fontSize, 12, 6, 72)}pt;
      --line-spacing: ${safeNum(rules.lineSpacing, 1.5, 1.0, 3.0)};
      --body-alignment: ${safeAlignment(rules.bodyAlignment)};
      --paragraph-indent: ${safeNum(rules.paragraphIndent, 0.5, 0, 3)}in;
      --footer-font-size: ${safeNum(rules.footerFontSize, 10, 6, 72)}pt;
      --caption-left-width: ${leftPct}%;
      --caption-center-width: ${centerPct}%;
      --caption-right-width: ${rightPct}%;
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

/** Render the document title block between two horizontal rules, bold ALL CAPS centered. */
function renderTitle(titleText: string): string {
  return `
    <div class="title-block">
      <hr class="title-rule" />
      <div class="document-title">${escapeHtml(titleText)}</div>
      <hr class="title-rule" />
    </div>`;
}

/** Render the standard court address line: "TO THE HONORABLE JUDGE OF SAID COURT:" */
function renderCourtAddress(): string {
  return `<div class="court-address">TO THE HONORABLE JUDGE OF SAID COURT:</div>`;
}

/** Render the opening introduction paragraph identifying the filer and document purpose. */
async function renderIntroduction(content: string): Promise<string> {
  return `<div class="body-paragraph">${await sanitizeTrustedHtml(content)}</div>`;
}

/** Render body sections — both body_sections (Roman-numeral headed) and body_numbered types. */
async function renderBodySections(sections: GeneratedSection[]): Promise<string> {
  const bodyParts = sections.filter(s =>
    s.sectionType === 'body_sections' || s.sectionType === 'body_numbered'
  );
  const rendered = await Promise.all(bodyParts.map(async (s) => {
    let html = '';
    if (s.heading) {
      html += `<div class="section-heading">${escapeHtml(s.heading)}</div>`;
    }
    // Render numbered items if present
    if (s.sectionType === 'body_numbered' && s.numberedItems?.length) {
      if (s.content?.trim()) {
        html += `<div class="body-paragraph">${await sanitizeTrustedHtml(s.content)}</div>`;
      }
      html += renderNumberedParagraphs(s.numberedItems);
    } else if (s.content?.trim()) {
      html += `<div class="body-paragraph">${await sanitizeTrustedHtml(s.content)}</div>`;
    }
    return html;
  }));
  return rendered.join('\n');
}

/** Render numbered paragraphs (1., 2., 3.) with hanging indent formatting. */
function renderNumberedParagraphs(items: string[]): string {
  return items
    .map((item, i) => {
      return `<div class="numbered-paragraph"><span class="number">${i + 1}.</span> ${escapeHtml(item)}</div>`;
    })
    .join('\n');
}

/** Render the Prayer for Relief section with WHEREFORE, PREMISES CONSIDERED preamble. */
async function renderPrayer(content: string): Promise<string> {
  return `
    <div class="prayer">
      <span class="formal-phrase">WHEREFORE, PREMISES CONSIDERED,</span> ${await sanitizeTrustedHtml(content)}
    </div>`;
}

/** Render a party signature block with name, role, contact details, and optional e-signature. */
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

/** Render the Certificate of Service attestation block with signer name and service date. */
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

/** Render the judge's signature block with blank lines for date and judge name. */
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

/** Render an 'APPROVED AS TO FORM' line for opposing counsel acknowledgment. */
function renderApprovalLine(name: string, role: string): string {
  return `
    <div class="approval-block">
      <div class="approval-label">APPROVED AS TO FORM ONLY:</div>
      <div class="signature-line">_________________________</div>
      <div class="signature-name">${escapeHtml(name)}</div>
      <div class="signature-role">${escapeHtml(role)}</div>
    </div>`;
}

/** Render a notary public acknowledgment block with blank fields for signature and commission. */
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

/**
 * Render a verification block (distinct from notary).
 * Verification contains the verified-statement language required by court rules.
 */
function renderVerificationBlock(): string {
  return `
    <div class="notary-block">
      <div class="cos-title">VERIFICATION</div>
      <div class="body-paragraph">
        I, <span class="fill-blank"></span>, being duly sworn, state under oath that
        the facts stated in the foregoing document are true and correct to the best of
        my knowledge and belief.
      </div>
      <div style="margin-top: 24pt;">
        <div class="signature-line">_________________________</div>
        <div class="signature-name"><span class="fill-blank"></span></div>
      </div>
      <div class="notary-sworn" style="margin-top: 24pt;">
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

/** Render a full-width horizontal rule spanning the body text width. */
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
export async function renderDocumentHTML(options: RenderDocumentOptions): Promise<string> {
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
        sectionHTML.push(renderCaption(caption)); // sync — no sanitization
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
          sectionHTML.push(await renderIntroduction(introContent.content));
        }
        break;
      }

      case 'body_sections':
        sectionHTML.push(await renderBodySections(bodyContent));
        break;

      case 'body_numbered': {
        // Match by sectionId when available so templates with multiple
        // body_numbered sections (e.g., unsworn declarations) each render
        // their own content instead of duplicating the first match.
        const numbered = bodyContent.find(s =>
          s.sectionType === 'body_numbered' &&
          (section.id ? s.sectionId === section.id : true)
        ) ?? bodyContent.find(s => s.sectionType === 'body_numbered');
        if (numbered?.numberedItems) {
          sectionHTML.push(renderNumberedParagraphs(numbered.numberedItems));
        }
        break;
      }

      case 'prayer_for_relief': {
        const prayerContent = bodyContent.find(s => s.sectionType === 'prayer_for_relief');
        if (prayerContent) {
          sectionHTML.push(await renderPrayer(prayerContent.content));
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
          sectionHTML.push(renderVerificationBlock());
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

/** Escape HTML special characters to prevent XSS in rendered documents.
 *  Use for user-provided text (names, headings, addresses). */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitize AI-generated HTML content (from GeneratedSection.content).
 * Uses DOMPurify + jsdom for robust server-side sanitization that handles
 * all bypass vectors (script content, unquoted URIs, entity-encoded URIs,
 * SVG event handlers, base/meta tags, etc.).
 *
 * Allows safe structural tags used in legal documents while stripping
 * dangerous elements. Use for content from our AI pipeline — NOT raw user input.
 *
 * jsdom is loaded lazily to avoid ESM/CJS bundling crashes on Vercel.
 */

/** Allowlist of tags safe for legal document content */
const ALLOWED_TAGS = [
  'p', 'br', 'em', 'strong', 'b', 'i', 'u',
  'ol', 'ul', 'li',
  'span', 'div',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'pre', 'code',
  'sub', 'sup', 'hr',
];

const ALLOWED_ATTR: string[] = [];

// Lazy singleton — initialized on first call to avoid module-scope jsdom import.
// Uses a promise guard to prevent concurrent initialization (race-safe).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _domPurifyPromise: Promise<any> | null = null;

/** Get or create the DOMPurify instance (lazy-loads jsdom). */
async function getDOMPurify() {
  if (!_domPurifyPromise) {
    _domPurifyPromise = (async () => {
      try {
        const { JSDOM } = await import('jsdom');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return createDOMPurify(new JSDOM('').window as any);
      } catch (err) {
        _domPurifyPromise = null; // Reset so next call retries
        throw new Error(
          `Failed to load jsdom for HTML sanitization: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err instanceof Error ? err : new Error(String(err)) }
        );
      }
    })();
  }
  return _domPurifyPromise;
}

/** Sanitize AI-generated legal document HTML via DOMPurify, allowing only safe structural tags. */
async function sanitizeTrustedHtml(html: string): Promise<string> {
  try {
    const purify = await getDOMPurify();
    return purify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
    });
  } catch {
    // Fallback: jsdom unavailable (Vercel ESM compat issue).
    // Content is from our own pipeline or user paste — escape for safety.
    console.warn('[sanitizeTrustedHtml] jsdom unavailable, falling back to escapeHtml');
    return escapeHtml(html);
  }
}
