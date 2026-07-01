'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MobileBottomActionBar,
  MobileFullScreenDialog,
} from '@/components/mobile-shell';
import {
  createInitialMobileDraft,
  getMobileDraftStorageKey,
  getMobileSectionStatusLabel,
  getMobileUnsavedDraftStorageKey,
} from '@/lib/mobile/docuvaultDraft';
import type { DocumentDraft, DocumentSection, ReportOutputType } from '@/lib/mobile/reportTypes';
import { usePersistentMobileState } from '@/lib/mobile/usePersistentMobileState';
import { MobileExportSheet } from './MobileExportSheet';

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

/** Mobile DocuVault draft review surface with editable outline sections. */
export function MobileDocuVaultDraftReview({
  caseId,
  documentType,
  documentTypeLabel,
  draftId,
  hasWorkspaceDraft,
}: MobileDocuVaultDraftReviewProps) {
  const draftStorageKey = getMobileDraftStorageKey(caseId, draftId);
  const unsavedStorageKey = getMobileUnsavedDraftStorageKey(caseId, draftId);
  const initialDraft = useMemo(
    () => createInitialMobileDraft(caseId, documentType, draftId),
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
  const [isExportOpen, setIsExportOpen] = useState(false);
  const activeSection = draft.sections.find((section) => section.id === activeSectionId) ?? null;
  const isDirty = Boolean(activeSection && editorText !== activeSection.body);
  const previewHref = `/case/${caseId}/docuvault/preview?draftId=${encodeURIComponent(draft.id)}&outputType=${draft.documentType}`;
  const unsavedWriteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUnsavedEditRef = useRef<UnsavedSectionEdit | null>(null);

  /** Cancel any pending localStorage write for active editor text. */
  const cancelPendingUnsavedWrite = useCallback(() => {
    if (unsavedWriteTimeoutRef.current) {
      clearTimeout(unsavedWriteTimeoutRef.current);
      unsavedWriteTimeoutRef.current = null;
    }
    pendingUnsavedEditRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cancelPendingUnsavedWrite();
    };
  }, [cancelPendingUnsavedWrite]);

  /** Open an outline section in the full-screen mobile editor. */
  const openEditor = (section: DocumentSection, restoredBody?: string) => {
    cancelPendingUnsavedWrite();
    setActiveSectionId(section.id);
    setEditorText(restoredBody ?? section.body);
    setShowDiscardConfirm(false);
  };

  /** Persist text changes locally so app interruptions do not erase draft edits. */
  const updateEditorText = (value: string) => {
    setEditorText(value);
    if (!activeSection) return;
    pendingUnsavedEditRef.current = {
      sectionId: activeSection.id,
      title: activeSection.title,
      body: value,
    };
    if (unsavedWriteTimeoutRef.current) {
      clearTimeout(unsavedWriteTimeoutRef.current);
    }
    unsavedWriteTimeoutRef.current = setTimeout(() => {
      if (pendingUnsavedEditRef.current) {
        setUnsavedEdit(pendingUnsavedEditRef.current);
      }
      pendingUnsavedEditRef.current = null;
      unsavedWriteTimeoutRef.current = null;
    }, 300);
  };

  /** Save the active section back into the persisted mobile draft. */
  const saveSection = () => {
    if (!activeSection) return;
    cancelPendingUnsavedWrite();
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
    cancelPendingUnsavedWrite();
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
                  {getMobileSectionStatusLabel(section.status)}
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
            href={previewHref}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 active:bg-neutral-100"
          >
            Preview PDF
          </Link>
          <button
            type="button"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl bg-neutral-900 px-4 text-sm font-semibold text-white active:bg-neutral-800"
            onClick={() => setIsExportOpen(true)}
          >
            Export
          </button>
        </div>
      </MobileBottomActionBar>

      <MobileExportSheet
        isOpen={isExportOpen}
        caseId={caseId}
        draft={draft}
        previewHref={previewHref}
        onClose={() => setIsExportOpen(false)}
        onMarkExported={() =>
          setDraft({
            ...draft,
            status: 'exported',
            updatedAt: new Date().toISOString(),
          })
        }
      />

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
                  cancelPendingUnsavedWrite();
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
