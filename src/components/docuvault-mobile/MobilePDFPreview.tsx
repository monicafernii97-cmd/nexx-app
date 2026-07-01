'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import {
  MobileBottomActionBar,
  MobileEmptyState,
  MobileErrorState,
  MobileIconButton,
  MobileSkeletonCard,
  MobileTopBar,
} from '@/components/mobile-shell';
import {
  buildMobileDocuVaultHref,
  buildMobilePreviewHref,
  createInitialMobileDraft,
  getMobileDraftStorageKey,
  getMobileDocumentTypeLabel,
  mobileDraftHasContent,
} from '@/lib/mobile/docuvaultDraft';
import { trackMobileEvent } from '@/lib/mobile/mobileAnalytics';
import type { DocumentDraft, ReportOutputType } from '@/lib/mobile/reportTypes';
import { usePersistentMobileState } from '@/lib/mobile/usePersistentMobileState';
import { MobileExportSheet } from './MobileExportSheet';

type PreviewState = 'loading' | 'ready' | 'error';

type MobilePDFPreviewProps = {
  caseId: string;
  draftId?: string;
  outputType?: ReportOutputType;
};

/** Route-level mobile PDF preview surface for saved DocuVault drafts. */
export function MobilePDFPreview({ caseId, draftId, outputType = 'both' }: MobilePDFPreviewProps) {
  const initialDraft = useMemo(
    () => createInitialMobileDraft(caseId, outputType, draftId),
    [caseId, outputType, draftId],
  );
  const {
    value: draft,
    setValue: setDraft,
  } = usePersistentMobileState<DocumentDraft>({
    key: getMobileDraftStorageKey(caseId, draftId),
    initialValue: initialDraft,
  });
  const [previewState, setPreviewState] = useState<PreviewState>(
    draft.status === 'failed' ? 'error' : 'loading',
  );
  const [isExportOpen, setIsExportOpen] = useState(false);
  const docuVaultHref = buildMobileDocuVaultHref(caseId, draft);
  const previewHref = buildMobilePreviewHref(caseId, draft);
  const hasContent = mobileDraftHasContent(draft);

  useEffect(() => {
    const startedAt = performance.now();
    const timeout = setTimeout(() => {
      if (draft.status === 'failed') {
        setPreviewState('error');
        trackMobileEvent('mobile_pdf_preview_failed', {
          caseId,
          draftId: draft.id,
          durationMs: Math.round(performance.now() - startedAt),
        });
        return;
      }
      setPreviewState('ready');
      trackMobileEvent('mobile_pdf_preview_opened', {
        caseId,
        draftId: draft.id,
        durationMs: Math.round(performance.now() - startedAt),
      });
    }, 350);

    return () => clearTimeout(timeout);
  }, [caseId, draft.id, draft.status]);

  const retryPreview = () => {
    setPreviewState('loading');
    setTimeout(() => {
      setPreviewState(draft.status === 'failed' ? 'error' : 'ready');
    }, 350);
  };

  return (
    <div className="light min-h-dvh bg-neutral-50 text-neutral-900">
      <MobileTopBar
        title="Preview"
        left={
          <Link
            href={docuVaultHref}
            aria-label="Back to DocuVault"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full active:bg-neutral-100"
          >
            <ArrowLeft aria-hidden="true" className="h-5 w-5" />
          </Link>
        }
        right={
          <MobileIconButton
            label="Open export options"
            onClick={() => setIsExportOpen(true)}
          >
            <FileText aria-hidden="true" className="h-5 w-5" />
          </MobileIconButton>
        }
      />

      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4">
        {previewState === 'loading' ? (
          <>
            <p className="text-sm font-medium text-neutral-600">Preparing preview...</p>
            <MobileSkeletonCard />
            <MobileSkeletonCard />
          </>
        ) : null}

        {previewState === 'error' ? (
          <MobileErrorState
            title="We couldn't load the preview."
            message="Your draft is still saved."
            action={
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-neutral-900 px-4 text-sm font-semibold text-white active:bg-neutral-800"
                onClick={retryPreview}
              >
                Try Again
              </button>
            }
          />
        ) : null}

        {previewState === 'ready' && !hasContent ? (
          <MobileEmptyState
            title="This draft has no preview yet."
            description="Review the sections and try again."
            action={
              <Link
                href={docuVaultHref}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-neutral-900 px-4 text-sm font-semibold text-white active:bg-neutral-800"
              >
                Back to Draft
              </Link>
            }
          />
        ) : null}

        {previewState === 'ready' && hasContent ? (
          <>
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                PDF Preview
              </p>
              <h1 className="mt-2 text-lg font-semibold text-neutral-900">
                {getMobileDocumentTypeLabel(draft.documentType)}
              </h1>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                Built from saved facts, timeline events, and linked sources.
              </p>
            </section>

            <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="border-b border-neutral-200 pb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Nexproof Draft
                </p>
                <h2 className="mt-2 text-base font-semibold text-neutral-900">
                  Case Report Preview
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  Draft reference: {draft.id}
                </p>
              </div>
              <div className="mt-5 space-y-6">
                {draft.sections.map((section) => {
                  const body = section.body.trim();
                  if (!body) return null;
                  return (
                    <section key={section.id} className="break-inside-avoid">
                      <h3 className="text-sm font-semibold text-neutral-900">{section.title}</h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-neutral-700">
                        {body}
                      </p>
                      {section.sourceCount ? (
                        <p className="mt-3 text-xs text-neutral-500">
                          {section.sourceCount} sources linked
                        </p>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </article>
          </>
        ) : null}
      </main>

      <MobileBottomActionBar>
        <button
          type="button"
          disabled={previewState !== 'ready' || !hasContent}
          className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-neutral-900 px-5 text-sm font-semibold text-white active:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => setIsExportOpen(true)}
        >
          Export PDF
        </button>
      </MobileBottomActionBar>

      <MobileExportSheet
        isOpen={isExportOpen}
        caseId={caseId}
        draft={draft}
        previewHref={previewHref}
        mode="preview"
        onClose={() => setIsExportOpen(false)}
        onMarkExported={() =>
          setDraft({
            ...draft,
            status: 'exported',
            updatedAt: new Date().toISOString(),
          })
        }
      />
    </div>
  );
}
