import { MobileCaseDetailTopBar } from '@/components/case-mobile';
import type { ReportOutputType } from '@/lib/mobile/reportTypes';

type MobileDocuVaultPageProps = {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{
    draftId?: string;
    outputType?: ReportOutputType;
    prefill?: string;
    source?: string;
  }>;
};

const outlineSections = [
  'Overview',
  'Key Facts',
  'Timeline Summary',
  'Observed Patterns',
  'Open Questions',
  'Source Notes',
];

/** Convert the mobile output type contract into user-facing DocuVault copy. */
function getDocumentTypeLabel(outputType?: ReportOutputType) {
  if (outputType === 'summary_pdf') return 'Case Summary PDF';
  if (outputType === 'court_document') return 'Court Document Draft';
  return 'Summary PDF + Court Document';
}

/** Initial mobile DocuVault handoff route for generated workspace drafts. */
export default async function MobileDocuVaultPage({
  params,
  searchParams,
}: MobileDocuVaultPageProps) {
  const { caseId } = await params;
  const { draftId, outputType, prefill, source } = await searchParams;
  const hasWorkspaceDraft = Boolean(draftId && prefill === '1' && source === 'workspace');
  const documentTypeLabel = getDocumentTypeLabel(outputType);

  return (
    <div className="light min-h-dvh bg-neutral-50 text-neutral-900">
      <MobileCaseDetailTopBar title="DocuVault" caseId={caseId} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-4">
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

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Document Type
          </p>
          <h2 className="mt-2 text-base font-semibold text-neutral-900">
            {documentTypeLabel}
          </h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Built from saved facts, timeline events, and linked sources.
          </p>
          {draftId ? (
            <p className="mt-3 rounded-2xl bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
              Draft reference: {draftId}
            </p>
          ) : null}
        </section>

        <section className="space-y-3">
          {outlineSections.map((section) => (
            <article
              key={section}
              className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold text-neutral-900">{section}</h2>
                <span className="rounded-full border border-neutral-300 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold text-neutral-700">
                  Review
                </span>
              </div>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-neutral-600">
                This section is ready for the mobile review and editing flow.
              </p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
