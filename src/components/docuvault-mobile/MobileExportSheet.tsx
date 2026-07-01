'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileBottomSheet } from '@/components/mobile-shell';
import { getMobileDraftPlainText } from '@/lib/mobile/docuvaultDraft';
import { trackMobileEvent } from '@/lib/mobile/mobileAnalytics';
import type { DocumentDraft } from '@/lib/mobile/reportTypes';
import { useMobileOnlineStatus } from '@/lib/mobile/useMobileOnlineStatus';

type ExportState = 'idle' | 'preparing' | 'success' | 'error';
type ExportOptionId = 'download_pdf' | 'save_docuvault' | 'share' | 'convert_court_document';

type ExportOption = {
  id: ExportOptionId;
  label: string;
  description: string;
  requiresOnline?: boolean;
};

type MobileExportSheetProps = {
  isOpen: boolean;
  caseId: string;
  draft: DocumentDraft;
  previewHref: string;
  mode?: 'docuvault' | 'preview';
  onClose: () => void;
  onMarkExported?: () => void;
};

/** Derive available export actions from the selected mobile document type. */
function getExportOptions(draft: DocumentDraft): ExportOption[] {
  const includesPdf = draft.documentType === 'summary_pdf' || draft.documentType === 'both';
  const includesCourtDocument =
    draft.documentType === 'court_document' || draft.documentType === 'both';

  return [
    ...(includesPdf
      ? [{
          id: 'download_pdf' as const,
          label: 'Download PDF',
          description: 'Open the print-ready preview and save it as a PDF.',
        }]
      : []),
    {
      id: 'save_docuvault',
      label: 'Save to DocuVault',
      description: 'Keep this draft available with your case documents.',
      requiresOnline: true,
    },
    {
      id: 'share',
      label: 'Share',
      description: 'Use your device share sheet when available.',
    },
    ...(includesCourtDocument
      ? [{
          id: 'convert_court_document' as const,
          label: 'Convert to Court Document',
          description: 'Keep this version ready for court-document drafting.',
          requiresOnline: true,
        }]
      : []),
  ];
}

/** Small async delay used to expose the preparing state without blocking the UI. */
function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** True when the device share sheet was intentionally cancelled by the user. */
function isShareAbortError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === 'AbortError' || error.name === 'NotAllowedError')
  );
}

/** Accessible mobile export sheet with retryable draft-safe export states. */
export function MobileExportSheet({
  isOpen,
  caseId,
  draft,
  previewHref,
  mode = 'docuvault',
  onClose,
  onMarkExported,
}: MobileExportSheetProps) {
  const router = useRouter();
  const [state, setState] = useState<ExportState>('idle');
  const [activeOption, setActiveOption] = useState<ExportOptionId | null>(null);
  const [lastOption, setLastOption] = useState<ExportOptionId | null>(null);
  const { isOnline } = useMobileOnlineStatus(caseId);
  const options = useMemo(() => getExportOptions(draft), [draft]);
  const plainText = useMemo(() => getMobileDraftPlainText(draft), [draft]);

  const resetSheet = () => {
    setState('idle');
    setActiveOption(null);
    setLastOption(null);
  };

  const closeSheet = () => {
    resetSheet();
    onClose();
  };

  const runExport = async (optionId: ExportOptionId) => {
    const startedAt = performance.now();
    setActiveOption(optionId);
    setLastOption(optionId);
    setState('preparing');
    trackMobileEvent('mobile_export_started', {
      caseId,
      draftId: draft.id,
      status: optionId,
    });

    try {
      await wait(450);

      if (optionId === 'download_pdf') {
        if (mode === 'preview') {
          window.print();
        } else {
          router.push(previewHref);
          closeSheet();
          return;
        }
      }

      if (optionId === 'share') {
        if (navigator.share) {
          try {
            await navigator.share({
              title: 'Nexproof draft',
              text: plainText || 'Nexproof draft',
            });
          } catch (error) {
            if (isShareAbortError(error)) {
              resetSheet();
              return;
            }
            throw error;
          }
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(plainText || 'Nexproof draft');
        } else {
          throw new Error('Share is not available on this device.');
        }
      }

      if (optionId === 'save_docuvault' || optionId === 'convert_court_document') {
        onMarkExported?.();
      }

      setState('success');
      trackMobileEvent('mobile_export_succeeded', {
        caseId,
        draftId: draft.id,
        status: optionId,
        durationMs: Math.round(performance.now() - startedAt),
      });
    } catch {
      setState('error');
      trackMobileEvent('mobile_export_failed', {
        caseId,
        draftId: draft.id,
        status: optionId,
        durationMs: Math.round(performance.now() - startedAt),
      });
    } finally {
      setActiveOption(null);
    }
  };

  const retry = () => {
    if (lastOption) {
      void runExport(lastOption);
    }
  };

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      title="Export Draft"
      description="Choose how you want to use this document."
      onClose={state === 'preparing' ? () => undefined : closeSheet}
    >
      {state === 'success' ? (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
          <h3 className="text-sm font-semibold text-neutral-900">Your document is ready.</h3>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Your draft is still saved in DocuVault.
          </p>
          <button
            type="button"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-neutral-900 px-4 text-sm font-semibold text-white active:bg-neutral-800"
            onClick={closeSheet}
          >
            Done
          </button>
        </div>
      ) : null}

      {state === 'error' ? (
        <div role="alert" className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
          <h3 className="text-sm font-semibold text-neutral-900">
            We could not export the document.
          </h3>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Your draft is still saved.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-neutral-900 px-4 text-sm font-semibold text-white active:bg-neutral-800"
              onClick={retry}
            >
              Try Again
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 active:bg-neutral-100"
              onClick={closeSheet}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {state !== 'success' && state !== 'error' ? (
        <div className="space-y-2">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={state === 'preparing' || (option.requiresOnline && !isOnline)}
              className="flex min-h-14 w-full flex-col justify-center rounded-2xl border border-neutral-200 px-4 py-3 text-left active:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void runExport(option.id)}
            >
              <span className="text-sm font-semibold text-neutral-900">
                {state === 'preparing' && activeOption === option.id
                  ? 'Preparing export...'
                  : option.label}
              </span>
              <span className="mt-1 text-xs leading-5 text-neutral-500">
                {option.requiresOnline && !isOnline
                  ? 'Reconnect to use this export option. Your draft is still saved.'
                  : option.description}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </MobileBottomSheet>
  );
}
