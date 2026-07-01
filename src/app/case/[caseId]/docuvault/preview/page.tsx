import { MobilePDFPreview } from '@/components/docuvault-mobile/MobilePDFPreview';
import type { ReportOutputType } from '@/lib/mobile/reportTypes';

type MobileDocuVaultPreviewPageProps = {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{
    draftId?: string;
    outputType?: ReportOutputType;
  }>;
};

/** Mobile print-ready preview route for generated DocuVault drafts. */
export default async function MobileDocuVaultPreviewPage({
  params,
  searchParams,
}: MobileDocuVaultPreviewPageProps) {
  const { caseId } = await params;
  const { draftId, outputType } = await searchParams;

  return (
    <MobilePDFPreview
      caseId={caseId}
      draftId={draftId}
      outputType={outputType}
    />
  );
}
