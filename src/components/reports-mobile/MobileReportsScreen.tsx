'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Plus, RotateCcw } from 'lucide-react';
import {
  MobileBottomActionBar,
  MobileBottomSheet,
  MobileEmptyState,
  MobilePrimaryActionButton,
} from '@/components/mobile-shell';
import type { MobileReportItem, MobileReportStatus } from '@/lib/mobile/caseUtilityData';
import {
  buildMobileDocuVaultHref,
  buildMobilePreviewHref,
  createInitialMobileDraft,
  getMobileDocumentTypeLabel,
} from '@/lib/mobile/docuvaultDraft';

type MobileReportsScreenProps = {
  caseId: string;
  reports: MobileReportItem[];
};

const statusLabel: Record<MobileReportStatus, string> = {
  draft: 'Draft',
  processing: 'Processing',
  exported: 'Exported',
  failed: 'Failed',
};

function statusClasses(status: MobileReportStatus) {
  if (status === 'exported') return 'bg-neutral-900 text-white';
  if (status === 'failed') return 'bg-neutral-100 text-neutral-700';
  if (status === 'processing') return 'bg-neutral-100 text-neutral-700';
  return 'bg-white text-neutral-700 border border-neutral-200';
}

/** Previous mobile report list with resume, retry, preview, and create actions. */
export function MobileReportsScreen({ caseId, reports }: MobileReportsScreenProps) {
  const router = useRouter();
  const [items, setItems] = useState(reports);
  const [activeReport, setActiveReport] = useState<MobileReportItem | null>(null);

  const hasReports = items.length > 0;
  const sortedReports = useMemo(() => items, [items]);

  const openReport = (report: MobileReportItem) => {
    const draft = createInitialMobileDraft(caseId, report.type, report.id);
    if (report.status === 'exported') {
      router.push(buildMobilePreviewHref(caseId, draft));
      return;
    }
    router.push(buildMobileDocuVaultHref(caseId, draft));
  };

  const retryReport = (report: MobileReportItem) => {
    setItems((current) => current.map((item) => (
      item.id === report.id ? { ...item, status: 'processing' } : item
    )));
    window.setTimeout(() => {
      setItems((current) => current.map((item) => (
        item.id === report.id ? { ...item, status: 'draft' } : item
      )));
    }, 900);
  };

  return (
    <>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4">
        {hasReports ? (
          <div className="space-y-3">
            {sortedReports.map((report) => (
              <article
                key={report.id}
                className="rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-900 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-neutral-500">
                      {getMobileDocumentTypeLabel(report.type)}
                    </p>
                    <h2 className="mt-2 text-sm font-semibold">{report.title}</h2>
                    <p className="mt-1 text-xs text-neutral-500">{report.createdAt}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusClasses(report.status)}`}>
                    {statusLabel[report.status]}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {report.status === 'failed' ? (
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 active:bg-neutral-100"
                      onClick={() => retryReport(report)}
                    >
                      <RotateCcw aria-hidden="true" className="h-4 w-4" />
                      Retry
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 active:bg-neutral-100"
                      onClick={() => openReport(report)}
                    >
                      <FileText aria-hidden="true" className="h-4 w-4" />
                      {report.status === 'exported' ? 'View' : 'Resume'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold text-neutral-600 active:bg-neutral-100"
                    onClick={() => setActiveReport(report)}
                  >
                    Details
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <MobileEmptyState
            title="No reports yet."
            description="Generate a report from your workspace when you are ready."
          />
        )}
      </main>

      <MobileBottomActionBar>
        <MobilePrimaryActionButton onClick={() => router.push(`/case/${caseId}/workspace`)}>
          <span className="inline-flex items-center gap-2">
            <Plus aria-hidden="true" className="h-4 w-4" />
            Create Report
          </span>
        </MobilePrimaryActionButton>
      </MobileBottomActionBar>

      <MobileBottomSheet
        isOpen={Boolean(activeReport)}
        title={activeReport?.title ?? 'Report details'}
        description={activeReport ? `${statusLabel[activeReport.status]} report` : undefined}
        onClose={() => setActiveReport(null)}
      >
        {activeReport ? (
          <div className="space-y-3 text-sm leading-6 text-neutral-700">
            <p>
              Created {activeReport.createdAt}. Type: {getMobileDocumentTypeLabel(activeReport.type)}.
            </p>
            <p>
              Drafts can be resumed, failed reports can be retried, and exported reports can be viewed
              or downloaded from the preview screen.
            </p>
            <button
              type="button"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-neutral-900 px-4 text-sm font-semibold text-white active:bg-neutral-800"
              onClick={() => {
                if (activeReport.status === 'failed') {
                  retryReport(activeReport);
                  setActiveReport(null);
                  return;
                }
                openReport(activeReport);
              }}
            >
              {activeReport.status === 'failed' ? 'Retry Report' : 'Open Report'}
            </button>
          </div>
        ) : null}
      </MobileBottomSheet>
    </>
  );
}
