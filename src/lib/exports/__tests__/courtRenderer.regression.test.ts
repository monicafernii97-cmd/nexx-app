/**
 * Court Export Renderer Regression Tests
 *
 * Validates that renderCourtExportHTML produces structurally correct HTML
 * for all court document elements: caption, title, body sections, prayer,
 * signature, certificate, verification, and page break rules.
 */

import { describe, expect, it } from 'vitest';
import { renderCourtExportHTML } from '../renderers/renderCourtExportHTML';
import type { CanonicalExportDocument, ExportCaption } from '../types';
import { PROFILE_REGISTRY } from '@/lib/jurisdiction/profiles/registry';
import { assertExportProfile } from '@/lib/jurisdiction/assertProfileForPipeline';

// ── Profiles ──
const txProfile = assertExportProfile(PROFILE_REGISTRY.get('tx-default')!);
const usProfile = assertExportProfile(PROFILE_REGISTRY.get('us-default')!);
const fedProfile = assertExportProfile(PROFILE_REGISTRY.get('federal-default')!);

// ── Helpers ──

/** Build a minimal court document fixture with optional overrides. */
function makeCourtDoc(
  overrides: Partial<CanonicalExportDocument> = {},
): CanonicalExportDocument {
  return {
    path: 'court_document',
    title: "PETITIONER'S ORIGINAL PETITION",
    metadata: { causeNumber: '2026-12345' },
    sections: [
      {
        kind: 'court_section',
        id: 'facts',
        heading: 'STATEMENT OF FACTS',
        paragraphs: ['Petitioner states the following facts.'],
      },
    ],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Structural Tests
// ═══════════════════════════════════════════════════════════════

describe('renderCourtExportHTML — structural output', () => {
  it('produces valid HTML document shell', () => {
    const html = renderCourtExportHTML(makeCourtDoc(), txProfile);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
    expect(html).toContain('<body>');
    expect(html).toContain('</body>');
  });

  it('renders title in document', () => {
    const html = renderCourtExportHTML(makeCourtDoc(), txProfile);
    expect(html).toContain("PETITIONER&#39;S ORIGINAL PETITION");
    expect(html).toContain('class="title"');
  });

  it('renders subtitle when present', () => {
    const html = renderCourtExportHTML(
      makeCourtDoc({ subtitle: 'AND REQUEST FOR TEMPORARY ORDERS' }),
      txProfile,
    );
    expect(html).toContain('AND REQUEST FOR TEMPORARY ORDERS');
    expect(html).toContain('class="subtitle"');
  });

  it('omits subtitle when absent', () => {
    const html = renderCourtExportHTML(makeCourtDoc(), txProfile);
    expect(html).not.toContain('class="subtitle"');
  });

  it('renders horizontal rule divider', () => {
    const html = renderCourtExportHTML(makeCourtDoc(), txProfile);
    expect(html).toContain('class="rule"');
  });
});

// ═══════════════════════════════════════════════════════════════
// Caption Tests
// ═══════════════════════════════════════════════════════════════

describe('renderCourtExportHTML — caption rendering', () => {
  const texasCaption: ExportCaption = {
    style: 'texas_pleading',
    causeLine: 'CAUSE NO. 2026-12345',
    leftLines: ['IN THE INTEREST OF', 'JANE DOE, CHILD'],
    centerLines: ['§', '§', '§'],
    rightLines: ['IN THE 387TH JUDICIAL DISTRICT', 'COURT OF FORT BEND COUNTY, TEXAS'],
  };

  it('renders Texas three-column caption table', () => {
    const html = renderCourtExportHTML(
      makeCourtDoc({ caption: texasCaption }),
      txProfile,
    );
    expect(html).toContain('class="caption-block"');
    expect(html).toContain('class="caption-table"');
    expect(html).toContain('class="caption-left"');
    expect(html).toContain('class="caption-center"');
    expect(html).toContain('class="caption-right"');
    expect(html).toContain('CAUSE NO. 2026-12345');
    expect(html).toContain('JANE DOE, CHILD');
    expect(html).toContain('§');
    expect(html).toContain('FORT BEND COUNTY, TEXAS');
  });

  const fedCaption: ExportCaption = {
    style: 'federal_caption',
    causeLine: 'Case No. 4:26-cv-01234',
    leftLines: ['JANE DOE,', 'Petitioner,'],
    centerLines: [],
    rightLines: ['v.', 'JOHN DOE,', 'Respondent.'],
  };

  it('renders federal two-column caption (no center)', () => {
    const html = renderCourtExportHTML(
      makeCourtDoc({ caption: fedCaption }),
      fedProfile,
    );
    expect(html).toContain('class="caption-left"');
    expect(html).toContain('class="caption-right"');
    expect(html).toContain('Case No. 4:26-cv-01234');
    // Federal caption should NOT have center column
    expect(html).not.toContain('class="caption-center"');
  });

  it('omits caption block when caption is null', () => {
    const html = renderCourtExportHTML(
      makeCourtDoc({ caption: null }),
      usProfile,
    );
    expect(html).not.toContain('class="caption-block"');
  });

  it('omits caption block when caption is undefined', () => {
    const html = renderCourtExportHTML(makeCourtDoc(), usProfile);
    expect(html).not.toContain('class="caption-block"');
  });
});

// ═══════════════════════════════════════════════════════════════
// Body Section Tests
// ═══════════════════════════════════════════════════════════════

describe('renderCourtExportHTML — body sections', () => {
  it('renders section heading', () => {
    const html = renderCourtExportHTML(makeCourtDoc(), txProfile);
    expect(html).toContain('class="section-heading"');
    expect(html).toContain('STATEMENT OF FACTS');
  });

  it('renders paragraphs', () => {
    const html = renderCourtExportHTML(makeCourtDoc(), txProfile);
    expect(html).toContain('class="body-paragraph"');
    expect(html).toContain('Petitioner states the following facts.');
  });

  it('renders numbered items', () => {
    const doc = makeCourtDoc({
      sections: [
        {
          kind: 'court_section',
          id: 'prayer',
          heading: 'PRAYER',
          numberedItems: ['Grant sole custody.', 'Award child support.', 'Grant all other relief.'],
        },
      ],
    });
    const html = renderCourtExportHTML(doc, txProfile);
    expect(html).toContain('class="numbered-item"');
    expect(html).toContain('1. Grant sole custody.');
    expect(html).toContain('2. Award child support.');
    expect(html).toContain('3. Grant all other relief.');
  });

  it('renders bullet lists', () => {
    const doc = makeCourtDoc({
      sections: [
        {
          kind: 'court_section',
          id: 'issues',
          heading: 'KEY ISSUES',
          bulletItems: ['Custody', 'Child support', 'Property division'],
        },
      ],
    });
    const html = renderCourtExportHTML(doc, txProfile);
    expect(html).toContain('class="bullet-list"');
    expect(html).toContain('<li>Custody</li>');
    expect(html).toContain('<li>Child support</li>');
  });

  it('renders multiple sections in order', () => {
    const doc = makeCourtDoc({
      sections: [
        { kind: 'court_section', id: 's1', heading: 'SECTION ONE', paragraphs: ['First.'] },
        { kind: 'court_section', id: 's2', heading: 'SECTION TWO', paragraphs: ['Second.'] },
      ],
    });
    const html = renderCourtExportHTML(doc, txProfile);
    expect(html).toContain('SECTION ONE');
    expect(html).toContain('SECTION TWO');
    const idx1 = html.indexOf('SECTION ONE');
    const idx2 = html.indexOf('SECTION TWO');
    expect(idx1).toBeLessThan(idx2);
  });

  it('filters out non-court sections', () => {
    const doc = makeCourtDoc({
      sections: [
        { kind: 'court_section', id: 'body', heading: 'Facts', paragraphs: ['Real content.'] },
        { kind: 'summary_section', id: 'rogue', heading: 'Should Not Appear', paragraphs: ['Hidden.'] } as never,
      ],
    });
    const html = renderCourtExportHTML(doc, txProfile);
    expect(html).toContain('Real content.');
    expect(html).not.toContain('Should Not Appear');
  });
});

// ═══════════════════════════════════════════════════════════════
// Closing Block Tests
// ═══════════════════════════════════════════════════════════════

describe('renderCourtExportHTML — closing blocks', () => {
  it('renders signature block', () => {
    const html = renderCourtExportHTML(
      makeCourtDoc({
        signature: {
          intro: 'Respectfully submitted,',
          signerLines: ['/s/ Jane Doe', 'Jane Doe, Pro Se'],
        },
      }),
      txProfile,
    );
    expect(html).toContain('class="signature-block"');
    expect(html).toContain('Respectfully submitted,');
    expect(html).toContain('/s/ Jane Doe');
    expect(html).toContain('Jane Doe, Pro Se');
  });

  it('omits signature block when absent', () => {
    const html = renderCourtExportHTML(makeCourtDoc(), txProfile);
    expect(html).not.toContain('class="signature-block"');
  });

  it('renders certificate of service block', () => {
    const html = renderCourtExportHTML(
      makeCourtDoc({
        certificate: {
          heading: 'CERTIFICATE OF SERVICE',
          bodyLines: ['I certify that on April 23, 2026, a copy was served via e-file.'],
          signerLines: ['/s/ Jane Doe'],
        },
      }),
      txProfile,
    );
    expect(html).toContain('class="certificate-block"');
    expect(html).toContain('class="certificate-heading"');
    expect(html).toContain('CERTIFICATE OF SERVICE');
    expect(html).toContain('served via e-file');
    expect(html).toContain('/s/ Jane Doe');
  });

  it('omits certificate when absent', () => {
    const html = renderCourtExportHTML(makeCourtDoc(), txProfile);
    expect(html).not.toContain('class="certificate-block"');
  });

  it('renders verification block', () => {
    const html = renderCourtExportHTML(
      makeCourtDoc({
        verification: {
          heading: 'VERIFICATION',
          bodyLines: ['I, Jane Doe, declare under penalty of perjury that the foregoing is true and correct.'],
          signerLines: ['/s/ Jane Doe', 'JANE DOE'],
        },
      }),
      txProfile,
    );
    expect(html).toContain('class="verification-block"');
    expect(html).toContain('VERIFICATION');
    expect(html).toContain('penalty of perjury');
  });

  it('inserts certificate page break', () => {
    const html = renderCourtExportHTML(
      makeCourtDoc({
        certificate: {
          heading: 'CERTIFICATE OF SERVICE',
          bodyLines: ['Service line.'],
          signerLines: ['/s/ Signer'],
        },
      }),
      txProfile,
    );
    // Certificate block now renders with inline page-break-before: always
    expect(html).toContain('page-break-before: always');
  });
});

// ═══════════════════════════════════════════════════════════════
// Typography & Profile Integration
// ═══════════════════════════════════════════════════════════════

describe('renderCourtExportHTML — profile integration', () => {
  it('applies Texas profile typography', () => {
    const html = renderCourtExportHTML(makeCourtDoc(), txProfile);
    expect(html).toContain(txProfile.typography.fontFamily);
    expect(html).toContain(`${txProfile.typography.fontSizePt}pt`);
  });

  it('applies page margins from profile', () => {
    const html = renderCourtExportHTML(makeCourtDoc(), txProfile);
    // Profile-driven page properties should be present in @page rule
    expect(html).toContain('@page');
    expect(html).toContain(`${txProfile.page.widthIn}in`);
    expect(html).toContain(`${txProfile.page.heightIn}in`);
  });

  it('HTML output exceeds minimum length', () => {
    const html = renderCourtExportHTML(makeCourtDoc(), txProfile);
    expect(html.length).toBeGreaterThan(200);
  });
});
