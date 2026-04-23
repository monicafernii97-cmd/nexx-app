/**
 * Summary Export Renderer Regression Tests
 *
 * Validates renderSummaryExportHTML produces correct report-style HTML
 * with title, subtitle, metadata, summary sections, bullet lists,
 * and profile-aware typography.
 */

import { describe, expect, it } from 'vitest';
import { renderSummaryExportHTML } from '../renderers/renderSummaryExportHTML';
import type { CanonicalExportDocument, SummarySection } from '../types';
import { PROFILE_REGISTRY } from '@/lib/jurisdiction/profiles/registry';
import { assertExportProfile } from '@/lib/jurisdiction/assertProfileForPipeline';

const usProfile = assertExportProfile(PROFILE_REGISTRY.get('us-default')!);
const txProfile = assertExportProfile(PROFILE_REGISTRY.get('tx-default')!);

function makeSummaryDoc(
  overrides: Partial<CanonicalExportDocument> = {},
): CanonicalExportDocument {
  return {
    path: 'case_summary',
    title: 'CASE SUMMARY REPORT',
    metadata: {},
    sections: [
      {
        kind: 'summary_section',
        id: 'overview',
        heading: 'Overview',
        paragraphs: ['This case involves a custody dispute.'],
      },
    ],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Structural Tests
// ═══════════════════════════════════════════════════════════════

describe('renderSummaryExportHTML — structural output', () => {
  it('produces valid HTML document shell', () => {
    const html = renderSummaryExportHTML(makeSummaryDoc(), usProfile);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
  });

  it('renders report title', () => {
    const html = renderSummaryExportHTML(makeSummaryDoc(), usProfile);
    expect(html).toContain('class="report-title"');
    expect(html).toContain('CASE SUMMARY REPORT');
  });

  it('renders subtitle when present', () => {
    const html = renderSummaryExportHTML(
      makeSummaryDoc({ subtitle: 'Doe v. Doe' }),
      usProfile,
    );
    expect(html).toContain('class="report-subtitle"');
    expect(html).toContain('Doe v. Doe');
  });

  it('omits subtitle when absent', () => {
    const html = renderSummaryExportHTML(makeSummaryDoc(), usProfile);
    expect(html).not.toContain('class="report-subtitle"');
  });
});

// ═══════════════════════════════════════════════════════════════
// Metadata Tests
// ═══════════════════════════════════════════════════════════════

describe('renderSummaryExportHTML — metadata', () => {
  it('renders cause number', () => {
    const html = renderSummaryExportHTML(
      makeSummaryDoc({ metadata: { causeNumber: '2026-00001' } }),
      usProfile,
    );
    expect(html).toContain('class="meta-block"');
    expect(html).toContain('Cause No. 2026-00001');
  });

  it('renders jurisdiction metadata', () => {
    const html = renderSummaryExportHTML(
      makeSummaryDoc({
        metadata: {
          jurisdiction: { state: 'Texas', county: 'Fort Bend' },
        },
      }),
      usProfile,
    );
    expect(html).toContain('Fort Bend, Texas');
  });

  it('omits metadata block when empty', () => {
    const html = renderSummaryExportHTML(makeSummaryDoc(), usProfile);
    expect(html).not.toContain('class="meta-block"');
  });
});

// ═══════════════════════════════════════════════════════════════
// Section Tests
// ═══════════════════════════════════════════════════════════════

describe('renderSummaryExportHTML — sections', () => {
  it('renders section heading', () => {
    const html = renderSummaryExportHTML(makeSummaryDoc(), usProfile);
    expect(html).toContain('class="summary-heading"');
    expect(html).toContain('Overview');
  });

  it('renders section paragraphs', () => {
    const html = renderSummaryExportHTML(makeSummaryDoc(), usProfile);
    expect(html).toContain('class="summary-paragraph"');
    expect(html).toContain('custody dispute');
  });

  it('renders bullet items', () => {
    const doc = makeSummaryDoc({
      sections: [
        {
          kind: 'summary_section',
          id: 'issues',
          heading: 'Key Issues',
          bulletItems: ['Custody', 'Child support', 'Visitation'],
        },
      ],
    });
    const html = renderSummaryExportHTML(doc, usProfile);
    expect(html).toContain('class="summary-bullets"');
    expect(html).toContain('<li>Custody</li>');
    expect(html).toContain('<li>Child support</li>');
    expect(html).toContain('<li>Visitation</li>');
  });

  it('renders multiple sections in order', () => {
    const doc = makeSummaryDoc({
      sections: [
        { kind: 'summary_section', id: 's1', heading: 'Background', paragraphs: ['First section.'] },
        { kind: 'summary_section', id: 's2', heading: 'Issues', paragraphs: ['Second section.'] },
        { kind: 'summary_section', id: 's3', heading: 'Timeline', paragraphs: ['Third section.'] },
      ],
    });
    const html = renderSummaryExportHTML(doc, usProfile);
    const idx1 = html.indexOf('Background');
    const idx2 = html.indexOf('Issues');
    const idx3 = html.indexOf('Timeline');
    expect(idx1).toBeLessThan(idx2);
    expect(idx2).toBeLessThan(idx3);
  });

  it('filters out non-summary sections', () => {
    const doc = makeSummaryDoc({
      sections: [
        { kind: 'summary_section', id: 's1', heading: 'Valid', paragraphs: ['Real content.'] },
        { kind: 'court_section', id: 'rogue', heading: 'Rogue', paragraphs: ['Should not appear.'] } as never,
      ],
    });
    const html = renderSummaryExportHTML(doc, usProfile);
    expect(html).toContain('Real content.');
    expect(html).not.toContain('Should not appear');
  });
});

// ═══════════════════════════════════════════════════════════════
// Profile Integration
// ═══════════════════════════════════════════════════════════════

describe('renderSummaryExportHTML — profile integration', () => {
  it('applies profile typography', () => {
    const html = renderSummaryExportHTML(makeSummaryDoc(), txProfile);
    expect(html).toContain('Times New Roman');
    expect(html).toContain('12pt');
  });

  it('HTML exceeds minimum length', () => {
    const html = renderSummaryExportHTML(makeSummaryDoc(), usProfile);
    expect(html.length).toBeGreaterThan(200);
  });
});
