import { describe, expect, it } from 'vitest';
import { buildDocumentAliases, selectStoredDocumentCandidates } from '../documentSelection';
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
});
