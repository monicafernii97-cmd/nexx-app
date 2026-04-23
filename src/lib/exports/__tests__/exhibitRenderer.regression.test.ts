/**
 * Exhibit Packet Renderer Regression Tests
 *
 * Validates renderExhibitPacketHTML produces correct HTML for:
 * title page, exhibit index, cover sheets, text content, stamps,
 * Bates numbering, and page break structure.
 */

import { describe, expect, it } from 'vitest';
import { renderExhibitPacketHTML } from '../renderers/renderExhibitPacketHTML';
import type { CanonicalExportDocument } from '../types';
import { PROFILE_REGISTRY } from '@/lib/jurisdiction/profiles/registry';
import { assertExportProfile } from '@/lib/jurisdiction/assertProfileForPipeline';

const txProfile = assertExportProfile(PROFILE_REGISTRY.get('tx-default')!);
const usProfile = assertExportProfile(PROFILE_REGISTRY.get('us-default')!);

function makeExhibitDoc(
  overrides: Partial<CanonicalExportDocument> = {},
): CanonicalExportDocument {
  return {
    path: 'exhibit_document',
    title: 'EXHIBIT PACKET',
    metadata: { causeNumber: '2026-99999' },
    exhibitPacket: {
      packetTitle: 'Exhibit Packet — Doe v. Doe',
      organizationMode: 'chronological',
      labelStyle: 'alpha',
    },
    sections: [
      {
        kind: 'exhibit_index',
        id: 'idx',
        heading: 'INDEX OF EXHIBITS',
        entries: [
          { label: 'A', description: 'Text messages dated January 2026' },
          { label: 'B', description: 'Financial records' },
        ],
      },
      {
        kind: 'exhibit_cover',
        id: 'cover-a',
        heading: 'EXHIBIT A',
        exhibitLabel: 'A',
        summaryLines: ['Text messages between parties during January 2026.'],
      },
      {
        kind: 'exhibit_content',
        id: 'content-a',
        exhibitLabel: 'A',
        heading: 'Text Messages',
        paragraphs: ['Message 1: Hello.', 'Message 2: Goodbye.'],
        stampedTitle: 'EXHIBIT A',
      },
    ],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Title Page Tests
// ═══════════════════════════════════════════════════════════════

describe('renderExhibitPacketHTML — title page', () => {
  it('renders packet title page', () => {
    const html = renderExhibitPacketHTML(makeExhibitDoc(), txProfile);
    expect(html).toContain('class="packet-title-page"');
    expect(html).toContain('class="packet-title"');
    expect(html).toContain('Doe v. Doe');
  });

  it('renders cause number on title page', () => {
    const html = renderExhibitPacketHTML(makeExhibitDoc(), txProfile);
    expect(html).toContain('Cause No. 2026-99999');
  });

  it('renders jurisdiction info on title page', () => {
    const html = renderExhibitPacketHTML(
      makeExhibitDoc({
        metadata: {
          causeNumber: '2026-99999',
          jurisdiction: { state: 'Texas', county: 'Fort Bend' },
        },
      }),
      txProfile,
    );
    expect(html).toContain('Fort Bend, Texas');
  });
});

// ═══════════════════════════════════════════════════════════════
// Index Page Tests
// ═══════════════════════════════════════════════════════════════

describe('renderExhibitPacketHTML — index page', () => {
  it('renders exhibit index table', () => {
    const html = renderExhibitPacketHTML(makeExhibitDoc(), txProfile);
    expect(html).toContain('exhibit-index-page');
    expect(html).toContain('class="index-table"');
    expect(html).toContain('INDEX OF EXHIBITS');
  });

  it('renders index entries with labels and descriptions', () => {
    const html = renderExhibitPacketHTML(makeExhibitDoc(), txProfile);
    expect(html).toContain('>A</td>');
    expect(html).toContain('Text messages dated January 2026');
    expect(html).toContain('>B</td>');
    expect(html).toContain('Financial records');
  });

  it('omits index page when no index section', () => {
    const doc = makeExhibitDoc({
      sections: [
        { kind: 'exhibit_content', id: 'c1', exhibitLabel: 'A', paragraphs: ['Content.'] },
      ],
    });
    const html = renderExhibitPacketHTML(doc, txProfile);
    expect(html).not.toContain('class="exhibit-index-page"');
  });
});

// ═══════════════════════════════════════════════════════════════
// Cover Page Tests
// ═══════════════════════════════════════════════════════════════

describe('renderExhibitPacketHTML — cover pages', () => {
  it('renders exhibit cover page', () => {
    const html = renderExhibitPacketHTML(makeExhibitDoc(), txProfile);
    expect(html).toContain('exhibit-cover-page');
    expect(html).toContain('class="cover-title"');
    expect(html).toContain('EXHIBIT A');
  });

  it('renders cover summary lines', () => {
    const html = renderExhibitPacketHTML(makeExhibitDoc(), txProfile);
    expect(html).toContain('class="cover-summary-line"');
    expect(html).toContain('Text messages between parties');
  });
});

// ═══════════════════════════════════════════════════════════════
// Content Page Tests
// ═══════════════════════════════════════════════════════════════

describe('renderExhibitPacketHTML — content pages', () => {
  it('renders exhibit content page', () => {
    const html = renderExhibitPacketHTML(makeExhibitDoc(), txProfile);
    expect(html).toContain('exhibit-content-page');
    expect(html).toContain('Message 1: Hello.');
    expect(html).toContain('Message 2: Goodbye.');
  });

  it('renders exhibit heading', () => {
    const html = renderExhibitPacketHTML(makeExhibitDoc(), txProfile);
    expect(html).toContain('class="exhibit-heading"');
    expect(html).toContain('Text Messages');
  });

  it('renders stamped title when profile requires it', () => {
    const html = renderExhibitPacketHTML(makeExhibitDoc(), txProfile);
    expect(html).toContain('class="exhibit-stamp"');
    expect(html).toContain('EXHIBIT A');
  });
});

// ═══════════════════════════════════════════════════════════════
// Bates Numbering Tests
// ═══════════════════════════════════════════════════════════════

describe('renderExhibitPacketHTML — Bates numbering', () => {
  it('renders Bates numbers when enabled', () => {
    const doc = makeExhibitDoc({
      exhibitPacket: {
        packetTitle: 'Packet',
        organizationMode: 'chronological',
        labelStyle: 'alpha',
        bates: { enabled: true, prefix: 'DOE', startNumber: 1 },
      },
    });
    const html = renderExhibitPacketHTML(doc, txProfile);
    expect(html).toContain('class="bates-number"');
    expect(html).toContain('DOE');
  });

  it('omits Bates numbers when disabled', () => {
    const html = renderExhibitPacketHTML(makeExhibitDoc(), txProfile);
    expect(html).not.toContain('class="bates-number"');
  });
});

// ═══════════════════════════════════════════════════════════════
// Page Break Tests
// ═══════════════════════════════════════════════════════════════

describe('renderExhibitPacketHTML — page breaks', () => {
  it('each exhibit section has page-break class', () => {
    const html = renderExhibitPacketHTML(makeExhibitDoc(), txProfile);
    // Index, cover, and content pages should all have page-break
    const pageBreaks = (html.match(/class="page-break/g) || []).length;
    expect(pageBreaks).toBeGreaterThanOrEqual(3);
  });
});

// ═══════════════════════════════════════════════════════════════
// Profile Integration
// ═══════════════════════════════════════════════════════════════

describe('renderExhibitPacketHTML — profile integration', () => {
  it('applies profile typography', () => {
    const html = renderExhibitPacketHTML(makeExhibitDoc(), txProfile);
    expect(html).toContain('Times New Roman');
  });

  it('HTML exceeds minimum length', () => {
    const html = renderExhibitPacketHTML(makeExhibitDoc(), usProfile);
    expect(html.length).toBeGreaterThan(200);
  });
});
