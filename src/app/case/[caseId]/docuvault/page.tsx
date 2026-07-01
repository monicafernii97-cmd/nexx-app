import { MobileCaseDetailTopBar } from '@/components/case-mobile';
import { MobileDocuVaultDraftReview } from '@/components/docuvault-mobile/MobileDocuVaultDraftReview';
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
  const documentType = outputType ?? 'both';
  const documentTypeLabel = getDocumentTypeLabel(outputType);

  return (
    <div className="light min-h-dvh bg-neutral-50 text-neutral-900">
      <MobileCaseDetailTopBar title="DocuVault" caseId={caseId} />
      <MobileDocuVaultDraftReview
        caseId={caseId}
        documentType={documentType}
        documentTypeLabel={documentTypeLabel}
        draftId={draftId}
        hasWorkspaceDraft={hasWorkspaceDraft}
      />
    </div>
  );
}
