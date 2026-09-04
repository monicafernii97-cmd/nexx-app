import { describe, expect, it } from 'vitest';
import { classifyCreationProvenance, qaRunIdFromFilename } from '../../../../convex/lib/qaProvenance';

describe('QA provenance', () => {
  const email = 'upload-robot-owner+production@nexproof.io';
  const runId = 'e2e-release-abcdef12';
  const filename = `nexx-e2e-${runId}--signed-order.pdf`;

  it('requires robot identity, registered run, and matching fixture filename for synthetic provenance', () => {
    expect(qaRunIdFromFilename(filename)).toBe(runId);
    expect(classifyCreationProvenance({ email, filename, registeredQaRunId: runId })).toEqual({
      dataProvenance: 'synthetic', qaRunId: runId,
    });
  });

  it('marks robot content as QA even when it is not a registered fixture', () => {
    expect(classifyCreationProvenance({ email, filename })).toEqual({ dataProvenance: 'qa' });
  });

  it('does not classify a filename alone as QA or synthetic', () => {
    expect(classifyCreationProvenance({ email: 'real-user@example.com', filename, registeredQaRunId: runId }))
      .toEqual({ dataProvenance: 'production' });
  });
});
