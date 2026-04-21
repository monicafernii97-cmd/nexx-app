/**
 * Pagination Regression Tests
 *
 * Locks down page-break and keep-together CSS behavior in rendered HTML.
 * Prevents: certificate not forcing a new page, signature block splitting
 * across pages.
 */

import { describe, it, expect } from 'vitest';
import { parseLegalDocument } from '../parseLegalDocument';
import { renderLegalDocumentHTML } from '../renderLegalDocumentHTML';
import { resolveJurisdictionProfile } from '../jurisdiction/resolveJurisdictionProfile';

import { texasPleadingFixture } from './fixtures/texas-pleading';

describe('pagination regression — multi-state pleadings', () => {
  it('forces certificate onto a new page when jurisdiction profile requires it', () => {
    const doc = parseLegalDocument(texasPleadingFixture);
    const profile = resolveJurisdictionProfile({
      state: 'Texas',
      county: 'Fort Bend',
    });

    const html = renderLegalDocumentHTML(doc, profile);

    expect(profile.sections.certificateSeparatePage).toBe(true);
    expect(html).toContain('certificate-page');
    expect(html).toContain('page-break-before: always');
  });

  it('keeps signature block together when jurisdiction profile requires it', () => {
    const doc = parseLegalDocument(texasPleadingFixture);
    const profile = resolveJurisdictionProfile({
      state: 'Texas',
      county: 'Fort Bend',
    });

    const html = renderLegalDocumentHTML(doc, profile);

    expect(profile.sections.signatureKeepTogether).toBe(true);
    expect(html).toContain('no-break-inside');
  });
});
