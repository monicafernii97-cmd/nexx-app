/**
 * PDF Renderer — Puppeteer-based HTML→PDF conversion
 *
 * Uses @sparticuz/chromium-min + puppeteer-core for Vercel serverless deployment.
 * In local development, falls back to locally installed Chrome.
 *
 * The renderer takes fully-assembled HTML (from templateRenderer.ts) and
 * converts it to a PDF buffer using the court-rules-derived page settings.
 */

import type { CourtFormattingRules } from './types';

/**
 * Render HTML to a PDF buffer.
 *
 * @param html - Complete HTML document (from renderDocumentHTML)
 * @param rules - Court formatting rules (for page size, margins)
 * @returns PDF as Buffer
 */
export async function renderHTMLToPDF(
  html: string,
  rules: CourtFormattingRules,
  /** Optional cause number to display in the right side of footer-split. */
  causeNumber?: string
): Promise<Buffer> {
  let browser;

  try {
    // Dynamic imports for Vercel serverless compatibility
    const puppeteerCore = await import('puppeteer-core');

    if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
      // ── Production / Vercel ──
      const chromium = await import('@sparticuz/chromium-min');

      // Chromium binary version — MUST match @sparticuz/chromium-min in package.json
      const CHROMIUM_VERSION = '143.0.4';
      browser = await puppeteerCore.default.launch({
        args: chromium.default.args,
        executablePath: await chromium.default.executablePath(
          process.env.CHROMIUM_BINARY_URL ||
          `https://github.com/nicholasgasior/puppeteer-chromium/releases/download/v${CHROMIUM_VERSION}/chromium-v${CHROMIUM_VERSION}-pack.tar`
        ),
        headless: true,
      });
    } else {
      // ── Local development ──
      // Use puppeteer-core with system Chrome
      const possiblePaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      ];

      let executablePath = '';
      const { accessSync } = await import('fs');
      for (const p of possiblePaths) {
        try {
          accessSync(p);
          executablePath = p;
          break;
        } catch {
          // Try next path
        }
      }

      if (!executablePath) {
        throw new Error(
          'No Chrome/Chromium found. Install Google Chrome for local development.'
        );
      }

      browser = await puppeteerCore.default.launch({
        executablePath,
        headless: true,
      });
    }

    const page = await browser.newPage();

    // Set the HTML content
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // Build footer template for page numbering (TRCP requires page numbers)
    const showPageNumbers = rules.pageNumbering;
    // Build the page number content based on format preference
    const pageNumberContent = rules.pageNumberFormat === 'x-of-y'
      ? 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>'
      : '<span class="pageNumber"></span>';

    // Build footer template handling all pageNumberPosition values
    let footerTemplate = '';
    if (showPageNumbers) {
      const fontStyle = `font-size: ${rules.footerFontSize}pt; font-family: '${rules.fontFamily}', times, serif; color: #555;`;
      const padding = `padding: 0 ${rules.marginLeft}in;`;

      if (rules.pageNumberPosition === 'bottom-right') {
        footerTemplate = `<div style="${fontStyle} width: 100%; text-align: right; ${padding}">${pageNumberContent}</div>`;
      } else if (rules.pageNumberPosition === 'footer-split') {
        // Footer-split: page number left, cause number right
        const causeText = causeNumber ? `Cause No. ${causeNumber}` : '';
        footerTemplate = `<div style="${fontStyle} width: 100%; display: flex; justify-content: space-between; ${padding}"><span>${pageNumberContent}</span><span>${causeText}</span></div>`;
      } else {
        // Default: centered (covers 'bottom-center' and any other value)
        footerTemplate = `<div style="${fontStyle} width: 100%; text-align: center; ${padding}">${pageNumberContent}</div>`;
      }
    }

    // Generate PDF with court-rules-derived settings
    const pdfBuffer = await page.pdf({
      format: undefined, // Use explicit width/height instead
      width: `${rules.paperWidth}in`,
      height: `${rules.paperHeight}in`,
      margin: {
        top: `${rules.marginTop}in`,
        // Add footer accommodation when page numbers are enabled.
        // Use footerMarginMin from rules if available, otherwise add 0.25in buffer.
        bottom: showPageNumbers
          ? `${Math.max(rules.marginBottom, rules.marginBottom + 0.25)}in`
          : `${rules.marginBottom}in`,
        left: `${rules.marginLeft}in`,
        right: `${rules.marginRight}in`,
      },
      printBackground: true,
      preferCSSPageSize: false, // Use explicit dimensions from rules instead of CSS @page
      displayHeaderFooter: showPageNumbers,
      headerTemplate: '<span></span>', // Empty header
      footerTemplate,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}


/**
 * Render HTML to a PDF and return as a base64 string (useful for API responses).
 */
export async function renderHTMLToPDFBase64(
  html: string,
  rules: CourtFormattingRules
): Promise<string> {
  const pdfBytes = await renderHTMLToPDF(html, rules);
  return pdfBytes.toString('base64');
}
