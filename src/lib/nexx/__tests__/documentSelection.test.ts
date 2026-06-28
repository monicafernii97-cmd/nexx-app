import { describe, expect, it } from 'vitest';
import { buildDocumentAliases, detectStoredDocumentAmbiguity, selectStoredDocumentCandidates } from '../documentSelection';
import { detectDocumentReference } from '../documentReferenceDetection';

describe('buildDocumentAliases', () => {
  it('creates filename and order aliases for court orders', () => {
    const aliases = buildDocumentAliases({
      filename: 'Signed Final Order 2-25-22.pdf',
      detectedType: 'court_order',
    }).map((alias) => alias.normalizedAlias);

    expect(aliases).toContain('signed final order 2 25 22');
    expect(aliases).toContain('the order');
    expect(aliases).toContain('court order');
  });
});

describe('selectStoredDocumentCandidates', () => {
  const candidates = [
    {
      uploadedFileId: 'newer-final',
      filename: 'Final Order.pdf',
      createdAt: 300,
      detectedType: 'court_order',
      aliases: ['final order', 'the order'],
      memorySource: 'conversation_memory' as const,
    },
    {
      uploadedFileId: 'older-temporary',
      filename: 'Temporary Orders.pdf',
      createdAt: 200,
      detectedType: 'court_order',
      aliases: ['temporary orders', 'the order'],
      memorySource: 'case_memory' as const,
      isActiveDocument: true,
    },
    {
      uploadedFileId: 'old-exhibit',
      filename: 'Exhibit A.pdf',
      createdAt: 100,
      detectedType: 'exhibit',
      aliases: ['exhibit a'],
      memorySource: 'user_private_memory' as const,
    },
  ];

  it('prefers the active document for implicit follow-up references', () => {
    const result = selectStoredDocumentCandidates({
      message: 'What deadlines are in it?',
      detection: detectDocumentReference('What deadlines are in it?'),
      candidates,
      maxDocuments: 2,
    });

    expect(result.selected[0]).toMatchObject({
      uploadedFileId: 'older-temporary',
    });
    expect(result.selected[0].reasons).toContain('active_document');
  });

  it('lets explicit filename matches beat active-document recency', () => {
    const result = selectStoredDocumentCandidates({
      message: 'Go back to Final Order.pdf and check the exchange section.',
      detection: detectDocumentReference('Go back to Final Order.pdf and check the exchange section.'),
      candidates,
      maxDocuments: 2,
    });

    expect(result.selected[0]).toMatchObject({
      uploadedFileId: 'newer-final',
    });
    expect(result.selected[0].reasons).toContain('explicit_filename_match');
  });

  it('uses aliases to select older named documents', () => {
    const result = selectStoredDocumentCandidates({
      message: 'Check exhibit a for the exact wording.',
      detection: detectDocumentReference('Check exhibit a for the exact wording.'),
      candidates,
      maxDocuments: 1,
    });

    expect(result.selected[0]).toMatchObject({
      uploadedFileId: 'old-exhibit',
    });
    expect(result.selected[0].reasons).toContain('explicit_alias_match');
  });

  it('allows callers to score candidates without selecting documents', () => {
    const result = selectStoredDocumentCandidates({
      message: 'What deadlines are in it?',
      detection: detectDocumentReference('What deadlines are in it?'),
      candidates,
      maxDocuments: 0,
    });

    expect(result.selected).toHaveLength(0);
    expect(result.ranked).toHaveLength(candidates.length);
  });

  it('uses memory source as a tiebreaker without overriding explicit matches', () => {
    const result = selectStoredDocumentCandidates({
      message: 'Please pull exhibit a.',
      detection: detectDocumentReference('Please pull exhibit a.'),
      candidates,
      maxDocuments: 2,
    });

    expect(result.selected[0]).toMatchObject({
      uploadedFileId: 'old-exhibit',
    });
    expect(result.selected[0].reasons).toContain('explicit_alias_match');
    expect(result.selected[0].reasons).toContain('user_private_memory');
  });

  it('scores shared memory as its own source class', () => {
    const result = selectStoredDocumentCandidates({
      message: 'Please review the shared final order.',
      detection: detectDocumentReference('Please review the shared final order.'),
      candidates: [{
        uploadedFileId: 'shared-final',
        filename: 'Shared Final Order.pdf',
        createdAt: 400,
        detectedType: 'court_order',
        aliases: ['shared final order'],
        memorySource: 'shared_memory' as const,
      }],
      maxDocuments: 1,
    });

    expect(result.selected[0]).toMatchObject({
      uploadedFileId: 'shared-final',
    });
    expect(result.selected[0].reasons).toContain('shared_memory');
  });

  it('asks for clarification when multiple stored orders are similarly plausible', () => {
    const ambiguousCandidates = [
      {
        uploadedFileId: 'temporary',
        filename: 'Temporary Orders.pdf',
        createdAt: 300,
        detectedType: 'court_order',
        aliases: ['the order', 'court order'],
        memorySource: 'conversation_memory' as const,
      },
      {
        uploadedFileId: 'amended',
        filename: 'Amended Temporary Orders.pdf',
        createdAt: 290,
        detectedType: 'court_order',
        aliases: ['the order', 'court order'],
        memorySource: 'conversation_memory' as const,
      },
    ];
    const detection = detectDocumentReference('What deadlines are in the order?');
    const result = selectStoredDocumentCandidates({
      message: 'What deadlines are in the order?',
      detection,
      candidates: ambiguousCandidates,
      maxDocuments: 2,
    });

    const ambiguity = detectStoredDocumentAmbiguity({
      detection,
      ranked: result.ranked,
      candidates: ambiguousCandidates,
    });

    expect(ambiguity).toMatchObject({
      requiresClarification: true,
      reason: 'multiple_matching_documents',
    });
    expect(ambiguity?.options.map((option) => option.uploadedFileId)).toEqual(['temporary', 'amended']);
    expect(ambiguity?.options.map((option) => option.label)).toEqual(['Document 1', 'Document 2']);
    expect(ambiguity?.options[0]).toMatchObject({
      createdAt: 300,
      memorySource: 'conversation_memory',
    });
  });

  it('does not ask for clarification when the active document is a strong match', () => {
    const detection = detectDocumentReference('What deadlines are in it?');
    const result = selectStoredDocumentCandidates({
      message: 'What deadlines are in it?',
      detection,
      candidates,
      maxDocuments: 2,
    });

    expect(detectStoredDocumentAmbiguity({
      detection,
      ranked: result.ranked,
      candidates,
    })).toBeNull();
  });

  it('does not ask for clarification when an explicit filename identifies the document', () => {
    const detection = detectDocumentReference('Go back to Final Order.pdf and check the exchange section.');
    const result = selectStoredDocumentCandidates({
      message: 'Go back to Final Order.pdf and check the exchange section.',
      detection,
      candidates,
      maxDocuments: 2,
    });

    expect(detectStoredDocumentAmbiguity({
      detection,
      ranked: result.ranked,
      candidates,
    })).toBeNull();
  });

  it('treats generic prior-upload references as ambiguity-sensitive', () => {
    const genericUploadCandidates = [
      {
        uploadedFileId: 'first-upload',
        filename: 'First Upload.pdf',
        createdAt: 200,
        aliases: ['uploaded document'],
        memorySource: 'conversation_memory' as const,
      },
      {
        uploadedFileId: 'second-upload',
        filename: 'Second Upload.pdf',
        createdAt: 190,
        aliases: ['uploaded document'],
        memorySource: 'conversation_memory' as const,
      },
    ];
    const detection = detectDocumentReference('Please check the uploaded document again.');
    const result = selectStoredDocumentCandidates({
      message: 'Please check the uploaded document again.',
      detection,
      candidates: genericUploadCandidates,
      maxDocuments: 2,
    });

    expect(detection.referenceType).toBe('explicit_prior_upload');
    expect(detectStoredDocumentAmbiguity({
      detection,
      ranked: result.ranked,
      candidates: genericUploadCandidates,
    })?.options).toHaveLength(2);
  });
});
