import { describe, expect, it } from 'vitest';
import {
  canonicalDocumentIdsForRepair,
  canonicalizeDocumentCandidates,
  classifyRepairCandidate,
  containsAnyTarget,
  documentIdsForDerivedRepair,
  findDerivedDocumentReferences,
  stableRepairHash,
  withoutTargets,
} from '../qaStateRepair';

describe('QA state repair primitives', () => {
  it('requires identity or stored provenance instead of quarantining by filename alone', () => {
    expect(classifyRepairCandidate({
      creatorIsRobot: false,
      filenameHasSyntheticPrefix: true,
    })).toMatchObject({ classification: 'unclassified', confidence: 'medium' });
  });

  it('classifies explicit provenance and robot-created fixtures as confirmed', () => {
    expect(classifyRepairCandidate({
      dataProvenance: 'synthetic',
      creatorIsRobot: false,
      filenameHasSyntheticPrefix: false,
    }).classification).toBe('confirmed_synthetic');
    expect(classifyRepairCandidate({
      creatorIsRobot: true,
      filenameHasSyntheticPrefix: true,
      qaRunId: 'e2e-release-12345678',
    }).classification).toBe('confirmed_synthetic');
  });

  it('removes only approved targets and detects serialized references', () => {
    const targets = new Set(['doc-2']);
    expect(withoutTargets(['doc-1', 'doc-2', 'doc-3'], targets)).toEqual(['doc-1', 'doc-3']);
    expect(containsAnyTarget('{"selectedDocumentIds":["doc-2"]}', targets)).toBe(true);
    expect(containsAnyTarget('{"selectedDocumentIds":["doc-3"]}', targets)).toBe(false);
  });

  it('generates deterministic repair-state fingerprints', () => {
    expect(stableRepairHash({ active: null, ids: ['a'] }))
      .toBe(stableRepairHash({ active: null, ids: ['a'] }));
    expect(stableRepairHash({ ids: ['a'] })).not.toBe(stableRepairHash({ ids: ['b'] }));
  });

  it('filters ineligible documents and collapses only exact hash duplicates', () => {
    expect(canonicalizeDocumentCandidates([
      { uploadedFileId: 'active-order', eligible: true, fullTextSha256: 'same-order' },
      { uploadedFileId: 'duplicate-order', eligible: true, fullTextSha256: 'same-order' },
      { uploadedFileId: 'same-name-different-file', eligible: true, fullTextSha256: 'different' },
      { uploadedFileId: 'quarantined-fixture', eligible: false, fullTextSha256: 'fixture' },
    ])).toEqual({
      selectedDocumentIds: ['active-order', 'same-name-different-file'],
      rejected: [
        {
          uploadedFileId: 'duplicate-order',
          reason: 'exact_duplicate',
          canonicalUploadedFileId: 'active-order',
        },
        { uploadedFileId: 'quarantined-fixture', reason: 'ineligible' },
      ],
    });
  });

  it('does not deduplicate candidates without a stored exact fingerprint', () => {
    expect(canonicalizeDocumentCandidates([
      { uploadedFileId: 'signed-order-a', eligible: true },
      { uploadedFileId: 'signed-order-b', eligible: true },
    ]).selectedDocumentIds).toEqual(['signed-order-a', 'signed-order-b']);
  });

  it('recognizes an exact shared hash when records expose additional fingerprint fields', () => {
    expect(canonicalizeDocumentCandidates([
      { uploadedFileId: 'canonical', eligible: true, fullTextSha256: 'text', storageSha256: 'bytes' },
      { uploadedFileId: 'duplicate', eligible: true, storageSha256: 'bytes' },
    ])).toMatchObject({
      selectedDocumentIds: ['canonical'],
      rejected: [{ uploadedFileId: 'duplicate', reason: 'exact_duplicate' }],
    });
  });

  it('builds a canonical repaired active set without quarantined or adjudicated duplicate ids', () => {
    expect(canonicalDocumentIdsForRepair({
      existingIds: ['duplicate-a', 'synthetic-a', 'canonical', 'other'],
      canonicalUploadedFileId: 'canonical',
      quarantinedUploadedFileIds: new Set(['synthetic-a']),
      duplicateUploadedFileIds: new Set(['duplicate-a']),
    })).toEqual(['canonical', 'other']);
  });

  it('removes quarantined references without assigning a document during cleanup-only repair', () => {
    expect(documentIdsForDerivedRepair({
      existingIds: ['genuine-other', 'synthetic-a', 'genuine-other'],
      removedUploadedFileIds: new Set(['synthetic-a']),
    })).toEqual(['genuine-other']);
  });

  it('promotes a canonical document only when the repair explicitly supplies one', () => {
    expect(documentIdsForDerivedRepair({
      existingIds: ['duplicate-a', 'synthetic-a', 'canonical'],
      canonicalUploadedFileId: 'canonical',
      removedUploadedFileIds: new Set(['duplicate-a', 'synthetic-a']),
    })).toEqual(['canonical']);
  });

  it('finds quarantined references outside the upload row original conversation', () => {
    const matches = findDerivedDocumentReferences([
      { conversationId: 'fixture-origin', category: 'control', documentIds: [] },
      { conversationId: 'signed-order-chat', category: 'task', documentIds: ['synthetic-a'] },
      {
        conversationId: 'signed-order-chat',
        category: 'offer',
        serializedState: JSON.stringify({ uploadedFileId: 'synthetic-b' }),
      },
      { conversationId: 'unrelated-chat', category: 'plan', documentIds: ['genuine-order'] },
    ], new Set(['synthetic-a', 'synthetic-b']));

    expect(matches.map((match) => [match.conversationId, match.category])).toEqual([
      ['signed-order-chat', 'task'],
      ['signed-order-chat', 'offer'],
    ]);
  });
});
