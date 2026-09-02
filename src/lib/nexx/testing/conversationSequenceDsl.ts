import { buildCapabilitySnapshot, canPerformOperation } from '../capabilities/documentCapabilityLedger';
import type { CapabilityOperation, DocumentCapabilityInput } from '../capabilities/types';
import { decideFocusTransition } from '../orchestration/focusTransition';
import { derivePendingInteraction } from '../orchestration/pendingInteraction';
import { understandTurn } from '../orchestration/turnUnderstanding';
import type {
  ConversationControlSnapshot,
  ConversationTaskSnapshot,
  FocusTransition,
  TurnUnderstanding,
} from '../orchestration/types';

type DocumentFixture = Omit<DocumentCapabilityInput, 'uploadedFileId' | 'filename' | 'status' | 'authorized'> & {
  filename?: string;
  status?: DocumentCapabilityInput['status'];
  authorized?: boolean;
};

export type SequenceStepResult = {
  message: string;
  understanding: TurnUnderstanding;
  transition: FocusTransition;
  focusRevisionBefore: number;
  focusRevisionAfter: number;
};

function baseControl(): ConversationControlSnapshot {
  return {
    schemaVersion: 1,
    focusRevision: 0,
    activeDocumentIds: [],
    activeEvidenceGenerationIds: [],
    pendingOptions: [],
    confidence: 0,
    provenance: 'native_v1',
  };
}

/**
 * In-memory adapter mirroring the acceptance transaction: understand, decide,
 * atomically advance focus, then expose capability/publication assertions.
 */
export class ConversationSequence {
  readonly name: string;
  readonly documents = new Map<string, DocumentCapabilityInput>();
  readonly tasks = new Map<string, ConversationTaskSnapshot>();
  readonly steps: SequenceStepResult[] = [];
  control = baseControl();
  lastRetrieval: { documentId: string; chunks: number } | undefined;
  publicationPassed = false;

  constructor(name: string) {
    this.name = name;
  }

  givenDocument(id: string, fixture: DocumentFixture = {}) {
    this.documents.set(id, {
      uploadedFileId: id,
      filename: fixture.filename ?? `${id}.pdf`,
      status: fixture.status ?? 'ready',
      authorized: fixture.authorized ?? true,
      ...fixture,
    });
    return this;
  }

  user(message: string, options: { attach?: string } = {}) {
    if (options.attach) {
      if (!this.documents.has(options.attach)) throw new Error(`unknown_fixture_document:${options.attach}`);
      this.control = {
        ...this.control,
        activeDocumentIds: Array.from(new Set([...this.control.activeDocumentIds, options.attach])),
      };
    }
    const descriptors = Array.from(this.documents.values()).map((document) => ({
      uploadedFileId: document.uploadedFileId,
      filename: document.filename,
    }));
    const tasks = Array.from(this.tasks.values()).filter((task) => task.status === 'active');
    const understanding = understandTurn({
      message,
      controlState: this.control,
      activeTasks: tasks,
      activeDocumentDescriptors: descriptors,
    });
    const transition = decideFocusTransition({ message, understanding, controlState: this.control, tasks });
    const before = this.control.focusRevision;
    const changes = ['replace', 'branch', 'refine'].includes(transition.kind);
    let taskId = this.control.activeTaskId;
    let taskKind = this.control.activeTaskKind;
    let parentTaskId = this.control.parentTaskId;
    if (transition.kind === 'replace' || transition.kind === 'branch') {
      if (transition.kind === 'replace' && transition.previousTaskId) {
        const previous = this.tasks.get(transition.previousTaskId);
        if (previous) this.tasks.set(previous.taskId, { ...previous, status: 'completed' });
      }
      taskId = transition.newTask.taskId;
      taskKind = transition.newTask.kind;
      parentTaskId = transition.newTask.parentTaskId;
      this.tasks.set(taskId, {
        ...transition.newTask,
        status: 'active',
        evidenceGenerationIds: [],
      });
    }
    this.control = {
      ...this.control,
      focusRevision: before + (changes ? 1 : 0),
      activeTaskId: taskId,
      activeTaskKind: taskKind,
      parentTaskId,
      confidence: understanding.confidence,
      pendingAct: transition.kind === 'clarify'
        ? 'clarify'
        : transition.kind === 'replace' || (transition.kind === 'refine' && ['select', 'confirm', 'cancel'].includes(understanding.speechAct))
          ? undefined
          : this.control.pendingAct,
      pendingOptions: transition.kind === 'replace' || (transition.kind === 'refine' && ['select', 'confirm', 'cancel'].includes(understanding.speechAct))
        ? []
        : this.control.pendingOptions,
      lastAssistantOffer: transition.kind === 'replace' || (transition.kind === 'refine' && ['select', 'confirm', 'cancel'].includes(understanding.speechAct))
        ? undefined
        : this.control.lastAssistantOffer,
    };
    this.steps.push({
      message,
      understanding,
      transition,
      focusRevisionBefore: before,
      focusRevisionAfter: this.control.focusRevision,
    });
    return this;
  }

  assistantOffers(labels: string[]) {
    if (!this.control.activeTaskId) throw new Error('offer_without_active_task');
    const content = labels.length === 1
      ? `I can ${labels[0]} now. Would you like me to proceed?`
      : `Which would help: ${labels.join(', or ')}?`;
    const pending = derivePendingInteraction({
      content,
      taskId: this.control.activeTaskId,
      documentIds: this.control.activeDocumentIds,
      focusRevision: this.control.focusRevision,
    });
    this.control = {
      ...this.control,
      pendingAct: pending.pendingAct,
      pendingOptions: pending.options,
      lastAssistantOffer: pending.offer,
    };
    return this;
  }

  retrieve(documentId: string, minimumChunks = 1) {
    const document = this.documents.get(documentId);
    if (!document || !this.control.activeDocumentIds.includes(documentId)) throw new Error('retrieval_outside_active_scope');
    const chunks = Math.max(minimumChunks, document.chunkCount ?? 0);
    if (chunks < minimumChunks) throw new Error('retrieval_insufficient_chunks');
    this.lastRetrieval = { documentId, chunks };
    return this;
  }

  publish(operation: CapabilityOperation = 'answer_focused_question') {
    const selected = this.control.activeDocumentIds
      .map((id) => this.documents.get(id))
      .filter((document): document is DocumentCapabilityInput => Boolean(document));
    const decision = canPerformOperation(operation, buildCapabilitySnapshot({ turnId: `dsl-${this.steps.length}`, documents: selected }));
    this.publicationPassed = decision.allowed;
    return this;
  }

  expectFocus(expected: { taskKind?: string; documents?: string[]; taskId?: string }) {
    if (expected.taskKind && this.control.activeTaskKind !== expected.taskKind) throw new Error(`focus_kind:${this.control.activeTaskKind}`);
    if (expected.taskId && this.control.activeTaskId !== expected.taskId) throw new Error(`focus_task:${this.control.activeTaskId}`);
    if (expected.documents) {
      const actual = [...this.control.activeDocumentIds].sort();
      const wanted = [...expected.documents].sort();
      if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`focus_documents:${actual.join(',')}`);
    }
    return this;
  }

  expectNoReplacement() {
    if (this.steps.at(-1)?.transition.kind === 'replace') throw new Error('unexpected_focus_replacement');
    return this;
  }

  expectClarification() {
    if (this.steps.at(-1)?.transition.kind !== 'clarify' && this.steps.at(-1)?.understanding.ambiguityMaterial !== true) {
      throw new Error('clarification_expected');
    }
    return this;
  }

  expectRetrieval(expected: { document: string; minimumChunks: number }) {
    if (this.lastRetrieval?.documentId !== expected.document || this.lastRetrieval.chunks < expected.minimumChunks) {
      throw new Error('retrieval_expectation_failed');
    }
    return this;
  }

  expectPublicationPassed() {
    if (!this.publicationPassed) throw new Error('publication_not_passed');
    return this;
  }
}

export function scenario(name: string) {
  return new ConversationSequence(name);
}
