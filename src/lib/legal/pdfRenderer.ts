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
  rules: CourtFormattingRules
): Promise<Buffer> {
  let browser;

  try {
    // Dynamic imports for Vercel serverless compatibility
    const puppeteerCore = await import('puppeteer-core');

    if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
      // ── Production / Vercel ──
      const chromium = await import('@sparticuz/chromium-min');

      browser = await puppeteerCore.default.launch({
        args: chromium.default.args,
        executablePath: await chromium.default.executablePath(
          // Chromium binary URL must match @sparticuz/chromium-min version (v143.0.4)
          process.env.CHROMIUM_BINARY_URL ||
          'https://github.com/nicholasgasior/puppeteer-chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.tar'
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
    const pageNumberContent = rules.pageNumberFormat === 'x-of-y'
      ? 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>'
      : '<span class="pageNumber"></span>';

    const footerTemplate = showPageNumbers
      ? `<div style="font-size: ${rules.footerFontSize}pt; font-family: '${rules.fontFamily}', times, serif; color: #555; width: 100%; text-align: ${rules.pageNumberPosition === 'bottom-right' ? 'right' : 'center'}; padding: 0 ${rules.marginLeft}in;">${pageNumberContent}</div>`
      : '';

    // Generate PDF with court-rules-derived settings
    const pdfBuffer = await page.pdf({
      format: undefined, // Use explicit width/height instead
      width: `${rules.paperWidth}in`,
      height: `${rules.paperHeight}in`,
      margin: {
        top: `${rules.marginTop}in`,
        // Extra bottom margin when page numbers are enabled to accommodate footer
        bottom: showPageNumbers
          ? `${Math.max(rules.marginBottom, 1.0)}in`
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
  return Buffer.from(pdfBytes).toString('base64');
}
