import { describe, expect, it } from 'vitest';
import { ToolBroker } from '../tools/toolBroker';
import type { AuthorizedTool, ToolExecutionContext } from '../tools/contracts';

const readTool: AuthorizedTool<{ documentId: string }, { text: string }> = {
  name: 'read_document_pages',
  description: 'Read authorized document pages.',
  sideEffect: 'none',
  requiresConfirmation: false,
  validateArgs(value) {
    const documentId = (value as { documentId?: unknown })?.documentId;
    if (typeof documentId !== 'string') throw new Error('invalid');
    return { documentId };
  },
  resourceIds: (args) => [args.documentId],
  execute: async (args) => ({ result: { text: 'authorized text' }, resourceIds: [args.documentId], evidenceIds: ['chunk-1'] }),
};

const draftTool: AuthorizedTool<{ actionId: string }, { artifactId: string }> = {
  name: 'create_draft_artifact',
  description: 'Create a user-approved artifact.',
  sideEffect: 'material',
  requiresConfirmation: true,
  validateArgs(value) {
    const actionId = (value as { actionId?: unknown })?.actionId;
    if (typeof actionId !== 'string') throw new Error('invalid');
    return { actionId };
  },
  resourceIds: () => [],
  execute: async () => ({ result: { artifactId: 'artifact-1' } }),
};

const context: ToolExecutionContext = {
  turnId: 'turn-1', userId: 'user-1', tenantId: 'tenant-1', authorizationScopeHash: 'scope-1',
  authorizedResourceIds: new Set(['document-1']), confirmedActionIds: new Set(['confirm-1']),
};

describe('authorized tool broker', () => {
  it('executes a scoped read and records evidence', async () => {
    const broker = new ToolBroker([readTool]);
    const outcome = await broker.execute({
      call: { callId: 'call-1', name: 'read_document_pages', args: { documentId: 'document-1' } },
      context,
      policy: { maxToolCalls: 4, allowedToolNames: new Set(['read_document_pages']) },
      completedCallCount: 0,
    });
    expect(outcome.result).toEqual({ text: 'authorized text' });
    expect(outcome.receipt).toMatchObject({ status: 'completed', resourceIds: ['document-1'], evidenceIds: ['chunk-1'] });
  });

  it('rejects unauthorized resources before execution', async () => {
    const broker = new ToolBroker([readTool]);
    const outcome = await broker.execute({
      call: { callId: 'call-2', name: 'read_document_pages', args: { documentId: 'other-tenant-document' } },
      context,
      policy: { maxToolCalls: 4, allowedToolNames: new Set(['read_document_pages']) },
      completedCallCount: 0,
    });
    expect(outcome.receipt).toMatchObject({ status: 'rejected', failureCode: 'tool_resource_not_authorized' });
  });

  it('requires confirmation for material side effects', async () => {
    const broker = new ToolBroker([draftTool]);
    const denied = await broker.execute({
      call: { callId: 'call-3', name: 'create_draft_artifact', args: { actionId: 'draft-1' } },
      context,
      policy: { maxToolCalls: 4, allowedToolNames: new Set(['create_draft_artifact']) },
      completedCallCount: 0,
    });
    expect(denied.receipt.failureCode).toBe('tool_confirmation_required');

    const allowed = await broker.execute({
      call: { callId: 'call-4', name: 'create_draft_artifact', args: { actionId: 'draft-1' } },
      context,
      policy: { maxToolCalls: 4, allowedToolNames: new Set(['create_draft_artifact']) },
      completedCallCount: 0,
      confirmationId: 'confirm-1',
    });
    expect(allowed.receipt.status).toBe('completed');
  });
});
