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
import { assertQuickGenerateProfile } from '@/lib/jurisdiction/assertProfileForPipeline';

import { texasPleadingFixture } from './fixtures/texas-pleading';

describe('pagination regression — multi-state pleadings', () => {
  it('forces certificate onto a new page when jurisdiction profile requires it', () => {
    const doc = parseLegalDocument(texasPleadingFixture);
    const profile = resolveJurisdictionProfile({
      state: 'Texas',
      county: 'Fort Bend',
    });

    const qgProfile = assertQuickGenerateProfile(profile);

    const html = renderLegalDocumentHTML(doc, qgProfile);

    expect(qgProfile.sections.certificateSeparatePage).toBe(true);
    expect(html).toContain('certificate-of-service');
    expect(html).toContain('page-break-before: always');
  });

  it('keeps signature block together when jurisdiction profile requires it', () => {
    const doc = parseLegalDocument(texasPleadingFixture);
    const profile = resolveJurisdictionProfile({
      state: 'Texas',
      county: 'Fort Bend',
    });

    const qgProfile = assertQuickGenerateProfile(profile);

    const html = renderLegalDocumentHTML(doc, qgProfile);

    expect(qgProfile.sections.signatureKeepTogether).toBe(true);
    expect(html).toContain('no-break-inside');
  });
});
