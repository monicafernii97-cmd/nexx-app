import { describe, expect, it } from 'vitest';
import { detectDocumentReference } from '../documentReferenceDetection';

describe('detectDocumentReference', () => {
  it('detects deadline lookups against a remembered document', () => {
    expect(detectDocumentReference('What deadlines are in it?')).toMatchObject({
      referencesDocument: true,
      referenceType: 'deadline_lookup',
    });
    expect(detectDocumentReference('What are the deadlines in the order?')).toMatchObject({
      referencesDocument: true,
      referenceType: 'deadline_lookup',
    });
  });

  it('detects exact terminology checks', () => {
    expect(detectDocumentReference('Does it say shall or may?')).toMatchObject({
      referencesDocument: true,
      referenceType: 'terminology_check',
      requiresExactText: true,
      requiresPageOrSectionCitation: true,
    });
  });

  it('detects source location requests', () => {
    expect(detectDocumentReference('Where exactly does it say that in the order?')).toMatchObject({
      referencesDocument: true,
      referenceType: 'source_location_request',
      requiresPageOrSectionCitation: true,
    });
  });

  it('detects holiday possession follow-ups with curly apostrophes', () => {
    const detection = detectDocumentReference('For Father’s Day possession, does his time start Thursday?');

    expect(detection).toMatchObject({
      referencesDocument: true,
      referenceType: 'source_location_request',
      requiresExactText: true,
      requiresPageOrSectionCitation: true,
    });
    expect(detection.requestedTerms).toContain('father\'s day');
  });

  it('does not treat a plain holiday date question as document retrieval', () => {
    expect(detectDocumentReference('When is Father’s Day this year?').referencesDocument).toBe(false);
  });

  it('detects section lookups', () => {
    expect(detectDocumentReference('Re-check section 7 of the order.')).toMatchObject({
      referencesDocument: true,
      referenceType: 'section_lookup',
      requestedSections: ['section 7'],
    });
  });

  it('detects comparison requests', () => {
    expect(detectDocumentReference('Compare this amended order to the prior order.')).toMatchObject({
      referencesDocument: true,
      referenceType: 'comparison_request',
      mayNeedClarification: true,
    });
  });

  it.each([
    'What does Texas law say about custody?',
    'How do I file a motion?',
    'What is a temporary order?',
    'What are standard possession rules?',
    'How long does a modification take?',
    'What does conservatorship mean generally?',
    'How do I file a motion in order to get custody?',
  ])('does not treat generic legal questions as document retrieval: %s', (message) => {
    expect(detectDocumentReference(message).referencesDocument).toBe(false);
  });
});
