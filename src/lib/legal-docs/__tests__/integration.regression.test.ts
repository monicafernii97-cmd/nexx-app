/**
 * End-to-End PDF Integration Regression Tests
 *
 * Verifies the full pipeline produces real PDF bytes.
 * Requires a Chrome/Chromium binary — skipped when unavailable.
 *
 * These tests exercise: parse → profile → render HTML → PDF.
 * Prevents: broken Puppeteer invocation, empty PDF output,
 * pipeline assembly errors.
 */

import { describe, it, expect } from 'vitest';
import { parseLegalDocument } from '../parseLegalDocument';
import { renderLegalDocumentHTML } from '../renderLegalDocumentHTML';
import {
  resolveJurisdictionProfile,
  toCourtFormattingRules,
} from '../jurisdiction/resolveJurisdictionProfile';
import { assertQuickGenerateProfile } from '@/lib/jurisdiction/assertProfileForPipeline';

import { texasPleadingFixture } from './fixtures/texas-pleading';
import { floridaPleadingFixture } from './fixtures/florida-pleading';
import { federalPleadingFixture } from './fixtures/federal-pleading';

/**
 * Detect if Chrome is available for Puppeteer tests.
 * Integration tests are skipped in environments without Chrome
 * (e.g. CI runners without a browser binary).
 */
let chromeAvailable = false;
try {
  const { accessSync } = await import('fs');
  const paths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];
  chromeAvailable = paths.some((p) => {
    try { accessSync(p); return true; } catch { return false; }
  });
} catch {
  chromeAvailable = false;
}

const describeIfChrome = chromeAvailable ? describe : describe.skip;

describeIfChrome('integration regression — multi-state legal PDF generation', () => {
  it('produces non-empty PDF bytes for Texas pleading', async () => {
    const { renderHTMLToPDF } = await import('@/lib/legal/pdfRenderer');

    const doc = parseLegalDocument(texasPleadingFixture);
    const profile = resolveJurisdictionProfile({
      state: 'Texas',
      county: 'Fort Bend',
    });
    const rules = toCourtFormattingRules(profile);
    const html = renderLegalDocumentHTML(doc, assertQuickGenerateProfile(profile));
    const pdf = await renderHTMLToPDF(html, rules, doc.metadata.causeNumber);

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 60000);

  it('produces non-empty PDF bytes for Florida pleading', async () => {
    const { renderHTMLToPDF } = await import('@/lib/legal/pdfRenderer');

    const doc = parseLegalDocument(floridaPleadingFixture);
    const profile = resolveJurisdictionProfile({
      state: 'Florida',
      county: 'Miami-Dade',
    });
    const rules = toCourtFormattingRules(profile);
    const html = renderLegalDocumentHTML(doc, assertQuickGenerateProfile(profile));
    const pdf = await renderHTMLToPDF(html, rules);

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 60000);

  it('produces non-empty PDF bytes for federal pleading', async () => {
    const { renderHTMLToPDF } = await import('@/lib/legal/pdfRenderer');

    const doc = parseLegalDocument(federalPleadingFixture);
    // Use us-default profile for federal pleading — not Texas
    const profile = resolveJurisdictionProfile(null);
    const rules = toCourtFormattingRules(profile);
    const html = renderLegalDocumentHTML(doc, assertQuickGenerateProfile(profile));
    const pdf = await renderHTMLToPDF(html, rules);

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 60000);
});
