import { describe, expect, it } from 'vitest';
import {
  classifyRepairCandidate,
  containsAnyTarget,
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
});
