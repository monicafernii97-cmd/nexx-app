'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  MobileBottomActionBar,
  MobileFullScreenDialog,
} from '@/components/mobile-shell';
import type {
  DocumentDraft,
  DocumentSection,
  DocumentSectionStatus,
  ReportOutputType,
} from '@/lib/mobile/reportTypes';
import { usePersistentMobileState } from '@/lib/mobile/usePersistentMobileState';

type UnsavedSectionEdit = {
  sectionId: string;
  title: string;
  body: string;
};

type MobileDocuVaultDraftReviewProps = {
  caseId: string;
  documentType: ReportOutputType;
  documentTypeLabel: string;
  draftId?: string;
  hasWorkspaceDraft: boolean;
};

const sectionSeeds: Array<Pick<DocumentSection, 'id' | 'title' | 'status' | 'sourceCount'> & {
  body: string;
}> = [
  {
    id: 'overview',
    title: 'Overview',
    status: 'ready',
    sourceCount: 3,
    body: 'Summarize the main issue, the current posture, and the most important source-backed facts from the workspace.',
  },
  {
    id: 'key-facts',
    title: 'Key Facts',
    status: 'ready',
    sourceCount: 5,
    body: 'List the strongest saved facts in short, factual language. Keep each point tied to source material.',
  },
  {
    id: 'timeline-summary',
    title: 'Timeline Summary',
    status: 'needs_review',
    sourceCount: 4,
    body: 'Organize the most important timeline events in chronological order and check dates before export.',
  },
  {
    id: 'observed-patterns',
    title: 'Observed Patterns',
    status: 'needs_review',
    sourceCount: 2,
    body: 'Include only repeated, source-backed patterns. Avoid dramatic labels or unsupported conclusions.',
  },
  {
    id: 'open-questions',
    title: 'Open Questions',
    status: 'ready',
    sourceCount: 0,
    body: 'Capture missing facts, unclear dates, and anything that should be verified before court use.',
  },
  {
    id: 'source-notes',
    title: 'Source Notes',
    status: 'ready',
    sourceCount: 6,
    body: 'Preserve the source-backed basis for the draft so preview and export can remain traceable.',
  },
];

/** Create the first mobile document draft from workspace handoff state. */
function createInitialDraft(
  caseId: string,
  documentType: ReportOutputType,
  draftId?: string,
): DocumentDraft {
  const now = new Date().toISOString();
  return {
    id: draftId ?? `mobile-draft-${caseId}`,
    caseId,
    documentType,
    status: 'draft',
    source: 'workspace',
    sections: sectionSeeds.map((section) => ({
      ...section,
      preview: section.body,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

/** Render contract status labels without warning-heavy styling. */
function getStatusLabel(status: DocumentSectionStatus) {
  if (status === 'needs_review') return 'Review';
  if (status === 'empty') return 'Empty';
  return 'Ready';
}

/** Mobile DocuVault draft review surface with editable outline sections. */
export function MobileDocuVaultDraftReview({
  caseId,
  documentType,
  documentTypeLabel,
  draftId,
  hasWorkspaceDraft,
}: MobileDocuVaultDraftReviewProps) {
  const draftStorageKey = `mobile-docuvault-draft:${draftId ?? caseId}`;
  const unsavedStorageKey = `mobile-docuvault-unsaved:${draftId ?? caseId}`;
  const initialDraft = useMemo(
    () => createInitialDraft(caseId, documentType, draftId),
    [caseId, documentType, draftId],
  );
  const {
    value: draft,
    setValue: setDraft,
  } = usePersistentMobileState<DocumentDraft>({
    key: draftStorageKey,
    initialValue: initialDraft,
  });
  const {
    value: unsavedEdit,
    setValue: setUnsavedEdit,
    clear: clearUnsavedEdit,
  } = usePersistentMobileState<UnsavedSectionEdit | null>({
    key: unsavedStorageKey,
    initialValue: null,
  });
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [editorText, setEditorText] = useState('');
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const activeSection = draft.sections.find((section) => section.id === activeSectionId) ?? null;
  const isDirty = Boolean(activeSection && editorText !== activeSection.body);

  /** Open an outline section in the full-screen mobile editor. */
  const openEditor = (section: DocumentSection, restoredBody?: string) => {
    setActiveSectionId(section.id);
    setEditorText(restoredBody ?? section.body);
    setShowDiscardConfirm(false);
  };

  /** Persist text changes locally so app interruptions do not erase draft edits. */
  const updateEditorText = (value: string) => {
    setEditorText(value);
    if (!activeSection) return;
    setUnsavedEdit({
      sectionId: activeSection.id,
      title: activeSection.title,
      body: value,
    });
  };

  /** Save the active section back into the persisted mobile draft. */
  const saveSection = () => {
    if (!activeSection) return;
    const now = new Date().toISOString();
    setDraft({
      ...draft,
      updatedAt: now,
      sections: draft.sections.map((section) =>
        section.id === activeSection.id
          ? {
              ...section,
              body: editorText,
              preview: editorText,
              status: editorText.trim() ? 'ready' : 'empty',
            }
          : section,
      ),
    });
    clearUnsavedEdit();
    setActiveSectionId(null);
    setShowDiscardConfirm(false);
  };

  /** Ask before discarding local editor changes. */
  const requestCloseEditor = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    clearUnsavedEdit();
    setActiveSectionId(null);
  };

  /** Restore saved local text after an interruption or reload. */
  const restoreUnsavedEdit = () => {
    if (!unsavedEdit) return;
    const section = draft.sections.find((item) => item.id === unsavedEdit.sectionId);
    if (!section) {
      clearUnsavedEdit();
      return;
    }
    openEditor(section, unsavedEdit.body);
  };

  return (
    <>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4">
        {hasWorkspaceDraft ? (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h1 className="text-base font-semibold text-neutral-900">
              Your workspace data has been organized into a draft.
            </h1>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Review each section before previewing or exporting.
            </p>
          </section>
        ) : null}

        {unsavedEdit ? (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-neutral-900">
              Restore unsaved changes?
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              We found edits to {unsavedEdit.title} that were not saved.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-neutral-900 px-4 text-sm font-semibold text-white active:bg-neutral-800"
                onClick={restoreUnsavedEdit}
              >
                Restore
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 active:bg-neutral-100"
                onClick={clearUnsavedEdit}
              >
                Discard
              </button>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Document Type
          </p>
          <h2 className="mt-2 text-base font-semibold text-neutral-900">
            {documentTypeLabel}
          </h2>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-sm leading-6 text-neutral-600">
            Built from saved facts, timeline events, and linked sources.
          </p>
          {draftId ? (
            <p className="mt-3 rounded-2xl bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
              Draft reference: {draftId}
            </p>
          ) : null}
        </section>

        <section className="space-y-3">
          {draft.sections.map((section) => (
            <article
              key={section.id}
              className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold text-neutral-900">{section.title}</h2>
                <span className="rounded-full border border-neutral-300 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold text-neutral-700">
                  {getStatusLabel(section.status)}
                </span>
              </div>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-neutral-600">
                {section.preview || 'This section is empty.'}
              </p>
              <button
                type="button"
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 active:bg-neutral-100"
                onClick={() => openEditor(section)}
              >
                Edit
              </button>
            </article>
          ))}
        </section>
      </main>

      <MobileBottomActionBar>
        <div className="flex gap-3">
          <Link
            href={`/case/${caseId}/docuvault/preview?draftId=${encodeURIComponent(draft.id)}`}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 active:bg-neutral-100"
          >
            Preview PDF
          </Link>
          <button
            type="button"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl bg-neutral-900 px-4 text-sm font-semibold text-white active:bg-neutral-800"
          >
            Export
          </button>
        </div>
      </MobileBottomActionBar>

      <MobileFullScreenDialog
        isOpen={Boolean(activeSection)}
        title={activeSection?.title ?? 'Edit Section'}
        leftAction={
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-sm font-medium text-neutral-700"
            onClick={requestCloseEditor}
          >
            Cancel
          </button>
        }
        rightAction={
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-neutral-900"
            onClick={saveSection}
          >
            Save
          </button>
        }
        onClose={requestCloseEditor}
      >
        <textarea
          className="min-h-0 flex-1 resize-none rounded-2xl border border-neutral-300 p-4 text-sm leading-7 text-neutral-800 outline-none placeholder:text-neutral-400"
          placeholder="Edit this section..."
          value={editorText}
          onChange={(event) => updateEditorText(event.target.value)}
        />

        {showDiscardConfirm ? (
          <div
            role="alertdialog"
            aria-labelledby="discard-section-edits-title"
            className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
          >
            <h3 id="discard-section-edits-title" className="text-sm font-semibold text-neutral-900">
              Discard changes?
            </h3>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-neutral-900 px-4 text-sm font-semibold text-white active:bg-neutral-800"
                onClick={() => setShowDiscardConfirm(false)}
              >
                Keep Editing
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 active:bg-neutral-100"
                onClick={() => {
                  clearUnsavedEdit();
                  setActiveSectionId(null);
                  setShowDiscardConfirm(false);
                }}
              >
                Discard
              </button>
            </div>
          </div>
        ) : null}
      </MobileFullScreenDialog>
    </>
  );
}
