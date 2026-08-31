import { describe, expect, it } from 'vitest';
import { detectDocumentReference } from '../documentReferenceDetection';
import { renderExactRequestedPages } from '../requestedPageAnswer';

describe('renderExactRequestedPages', () => {
  it('preserves exact canonical text for every explicitly requested page', () => {
    const rendered = renderExactRequestedPages({
      detection: detectDocumentReference('Quote the tokens on pages 1, 50, and 100 of the document.'),
      pages: [
        { filename: 'order.pdf', pageNumber: 100, text: 'Verification token: END' },
        { filename: 'order.pdf', pageNumber: 1, text: 'Verification token: BEGIN' },
        { filename: 'order.pdf', pageNumber: 50, text: 'Verification token: MIDDLE' },
      ],
    });

    expect(rendered).toContain('page 1');
    expect(rendered).toContain('Verification token: BEGIN');
    expect(rendered).toContain('Verification token: MIDDLE');
    expect(rendered).toContain('Verification token: END');
    expect(rendered?.indexOf('page 1')).toBeLessThan(rendered?.indexOf('page 50') ?? -1);
  });

  it('does not replace interpretive answers that do not request exact text', () => {
    expect(renderExactRequestedPages({
      detection: detectDocumentReference('Summarize the uploaded document.'),
      pages: [{ filename: 'order.pdf', pageNumber: 1, text: 'Text' }],
    })).toBeNull();
  });
});
