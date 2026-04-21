/**
 * Renderer Layout Regression Tests — Multi-State Pleadings
 *
 * Locks down that HTML output contains the correct structural elements
 * per jurisdiction profile. Prevents: wrong caption layout, missing
 * headings, list collapse to paragraphs, cross-jurisdiction bleed.
 */

import { describe, it, expect } from 'vitest';
import { parseLegalDocument } from '../parseLegalDocument';
import { renderLegalDocumentHTML } from '../renderLegalDocumentHTML';
import { resolveJurisdictionProfile } from '../jurisdiction/resolveJurisdictionProfile';
import type { SavedCourtSettings } from '../jurisdiction/resolveJurisdictionProfile';

import { texasPleadingFixture } from './fixtures/texas-pleading';
import { floridaPleadingFixture } from './fixtures/florida-pleading';
import { californiaPleadingFixture } from './fixtures/california-pleading';
import { federalPleadingFixture } from './fixtures/federal-pleading';

/**
 * Render a fixture through the full parse → profile → HTML pipeline.
 * Reduces repeated boilerplate across test cases.
 */
function renderFixture(fixture: string, settings: SavedCourtSettings) {
  const doc = parseLegalDocument(fixture);
  const profile = resolveJurisdictionProfile(settings);
  const html = renderLegalDocumentHTML(doc, profile);
  return { doc, profile, html };
}

describe('renderer regression — multi-state pleadings', () => {
  // ── Texas ──

  it('renders Texas caption as a three-column pleading table', () => {
    const { html } = renderFixture(texasPleadingFixture, {
      state: 'Texas',
      county: 'Fort Bend',
    });

    expect(html).toContain('caption-table');
    expect(html).toContain('caption-left');
    expect(html).toContain('caption-center');
    expect(html).toContain('caption-right');
  });

  it('renders Texas title and subtitle in output', () => {
    const { html } = renderFixture(texasPleadingFixture, {
      state: 'Texas',
      county: 'Fort Bend',
    });

    expect(html).toContain('MOTION FOR TEMPORARY ORDERS');
    expect(html).toContain('Pending Final Hearing');
  });

  it('renders PRAYER heading when prayer block exists', () => {
    const { html } = renderFixture(texasPleadingFixture, {
      state: 'Texas',
      county: 'Fort Bend',
    });

    expect(html).toContain('PRAYER');
    expect(html).toContain('prayer-heading');
  });

  it('renders numbered lists as structured list blocks', () => {
    const { html } = renderFixture(texasPleadingFixture, {
      state: 'Texas',
      county: 'Fort Bend',
    });

    expect(html).toContain('numbered-list');
    expect(html).toContain('<li>1.');
  });

  it('renders bullet lists as structured bullet blocks', () => {
    const { html } = renderFixture(texasPleadingFixture, {
      state: 'Texas',
      county: 'Fort Bend',
    });

    expect(html).toContain('bullet-list');
  });

  // ── Cross-Jurisdiction Guard ──

  it('does not render Florida pleading with Texas three-column table', () => {
    const { profile, html } = renderFixture(floridaPleadingFixture, {
      state: 'Florida',
      county: 'Miami-Dade',
    });

    expect(profile.caption.useThreeColumnTable).toBe(false);
    // No three-column table element should be present
    expect(html).not.toContain('<table class="caption-table"');
  });

  it('does not render California pleading with Texas three-column table', () => {
    const { profile, html } = renderFixture(californiaPleadingFixture, {
      state: 'California',
      county: 'Los Angeles',
    });

    expect(profile.caption.style).not.toBe('texas_pleading');
    // No three-column table element should be present
    expect(html).not.toContain('<table class="caption-table"');
  });

  it('renders federal pleading title correctly', () => {
    // Use us-default profile for federal pleading
    const { html } = renderFixture(federalPleadingFixture, null);

    expect(html).toContain('MOTION FOR LEAVE TO AMEND');
  });
});
