import { MobileCaseDetailTopBar, MobileFullSummaryScreen } from '@/components/case-mobile';
import { getMobileCaseWorkspaceData } from '@/lib/mobile/caseWorkspaceData';

type MobileSummaryPageProps = {
  params: Promise<{ caseId: string }>;
};

/** Full mobile case summary route. */
export default async function MobileSummaryPage({ params }: MobileSummaryPageProps) {
  const { caseId } = await params;
  const data = getMobileCaseWorkspaceData(caseId);

  return (
    <div className="light min-h-dvh bg-neutral-50 text-neutral-900">
      <MobileCaseDetailTopBar title="Summary" caseId={caseId} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4">
        <MobileFullSummaryScreen text={data.fullSummary} />
      </main>
    </div>
  );
}

