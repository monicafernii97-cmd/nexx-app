import { describe, expect, it } from 'vitest';
import { detectDocumentReference } from '../documentReferenceDetection';
import { selectStoredDocumentCandidates } from '../documentSelection';
import { buildExecutionPlan } from '../orchestration/executionPlan';
import {
  decideDocumentActivation,
  isAwaitingUploadTurn,
} from '../orchestration/documentActivation';
import { resolveTurnRoute } from '../router';
import { understandTurn } from '../orchestration/turnUnderstanding';

const activeDocument = {
  uploadedFileId: 'signed-order',
  filename: 'Signed Final Order.pdf',
  createdAt: 1,
  detectedType: 'final_order',
  aliases: ['signed final order', 'the order'],
  memorySource: 'conversation_memory' as const,
  isActiveDocument: true,
};

function decision(message: string, overrides: Partial<Parameters<typeof decideDocumentActivation>[0]> = {}) {
  const understanding = understandTurn({
    message,
    foregroundIntentV2: true,
    controlState: {
      schemaVersion: 1,
      focusRevision: 2,
      activeTaskId: 'task-order',
      activeTaskKind: 'document_review',
      activeDocumentIds: ['signed-order'],
      activeEvidenceGenerationIds: [],
      pendingOptions: [],
      confidence: 1,
      provenance: 'native_v1',
    },
  });
  return decideDocumentActivation({
    message,
    speechAct: understanding.speechAct,
    requestedOperation: understanding.requestedOperation,
    detection: detectDocumentReference(message),
    hasCurrentAttachments: false,
    hasActiveDocumentContext: true,
    hasPendingDocumentAction: false,
    ...overrides,
  });
}

describe('foreground document activation', () => {
  it('retains document focus silently for a greeting without activating retrieval', () => {
    expect(decision('hey')).toMatchObject({
      active: false,
      preserveFocus: true,
      source: 'none',
      referenceStrength: 'none',
      reasonCodes: expect.arrayContaining(['social_turn']),
    });
  });

  it.each([
    'I will reupload the signed order.',
    "I'll upload a clean copy next.",
    'I’ll re-upload the signed copy.',
    'Let me attach the new PDF.',
    'Hold on, I need to send the document again.',
  ])('recognizes a future upload without analyzing historical files: %s', (message) => {
    expect(isAwaitingUploadTurn(message)).toBe(true);
    expect(decision(message)).toMatchObject({
      active: false,
      preserveFocus: true,
      reasonCodes: expect.arrayContaining(['awaiting_future_upload']),
    });
    expect(resolveTurnRoute({
      message,
      activeMode: 'document_analysis',
      hasActiveDocumentContext: true,
      foregroundIntentV2: true,
    }).mode).toBe('adaptive_chat');
  });

  it('carries an explicit pending document action into “please do so”', () => {
    expect(decision('please do so', {
      speechAct: 'confirm',
      pendingAct: 'confirm',
      hasPendingDocumentAction: true,
    })).toMatchObject({
      active: true,
      source: 'pending_action',
      referenceStrength: 'carried',
    });
  });

  it('uses only the new attachments when an awaited upload arrives', () => {
    expect(decision('Here it is.', {
      pendingAct: 'await_upload',
      hasCurrentAttachments: true,
    })).toMatchObject({
      active: true,
      source: 'current_attachment',
      useCurrentAttachmentsOnly: true,
      reasonCodes: expect.arrayContaining(['current_turn_attachment']),
    });
  });

  it('treats a current attachment as explicit authority even when the prompt uses an unmatched description', () => {
    expect(decision('Confirm that you received this synthetic test document.', {
      hasCurrentAttachments: true,
    })).toMatchObject({
      active: true,
      source: 'current_attachment',
      referenceStrength: 'explicit',
      useCurrentAttachmentsOnly: true,
    });
  });

  it('abstains before ranking stored documents when the current turn has no reference', () => {
    const result = selectStoredDocumentCandidates({
      message: 'hey',
      detection: detectDocumentReference('hey'),
      candidates: [activeDocument],
      maxDocuments: 5,
      requireMeaningfulReference: true,
    });

    expect(result).toMatchObject({
      selected: [],
      ranked: [],
      abstained: true,
      abstentionReason: 'no_meaningful_document_reference',
    });
  });

  it('builds a social turn plan with no document requirements', () => {
    const understanding = understandTurn({ message: 'hey', foregroundIntentV2: true });
    const activation = decision('hey');
    const plan = buildExecutionPlan({
      message: 'hey',
      understanding,
      transition: { kind: 'retain', reasonCodes: ['social_turn'] },
      taskId: 'task-order',
      focusRevision: 2,
      routeMode: 'adaptive_chat',
      activeDocumentIds: ['signed-order'],
      attachmentDocumentIds: [],
      documentActivation: activation,
    });

    expect(plan.selectedDocumentIds).toEqual([]);
    expect(plan.evidenceRequirements).toEqual([]);
    expect(plan.capabilityRequirements).toEqual([]);
  });

  it('builds an awaiting-upload status plan with no historical documents', () => {
    const message = 'Please do a fresh extraction; I will reupload the order.';
    const understanding = understandTurn({ message, foregroundIntentV2: true });
    const plan = buildExecutionPlan({
      message,
      understanding,
      transition: { kind: 'retain', reasonCodes: ['awaiting_future_upload'] },
      taskId: 'task-order',
      focusRevision: 2,
      routeMode: 'adaptive_chat',
      activeDocumentIds: ['signed-order'],
      attachmentDocumentIds: [],
      documentActivation: decision(message),
    });

    expect(understanding.requestedOperation).toBe('await_upload');
    expect(plan.responseAct).toBe('status');
    expect(plan.selectedDocumentIds).toEqual([]);
    expect(plan.retrievalQueries).toEqual([]);
  });
});
