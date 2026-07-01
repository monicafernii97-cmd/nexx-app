import { MobileCaseDetailTopBar } from '@/components/case-mobile';
import { MobileDocuVaultDraftReview } from '@/components/docuvault-mobile/MobileDocuVaultDraftReview';
import { getMobileDocumentTypeLabel } from '@/lib/mobile/docuvaultDraft';
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

/** Initial mobile DocuVault handoff route for generated workspace drafts. */
export default async function MobileDocuVaultPage({
  params,
  searchParams,
}: MobileDocuVaultPageProps) {
  const { caseId } = await params;
  const { draftId, outputType, prefill, source } = await searchParams;
  const hasWorkspaceDraft = Boolean(draftId && prefill === '1' && source === 'workspace');
  const documentType = outputType ?? 'both';
  const documentTypeLabel = getMobileDocumentTypeLabel(outputType);

  return (
    <div className="light min-h-dvh bg-neutral-50 text-neutral-900">
      <MobileCaseDetailTopBar title="DocuVault" caseId={caseId} />
      <MobileDocuVaultDraftReview
        key={draftId ?? caseId}
        caseId={caseId}
        documentType={documentType}
        documentTypeLabel={documentTypeLabel}
        draftId={draftId}
        hasWorkspaceDraft={hasWorkspaceDraft}
      />
    </div>
  );
}
