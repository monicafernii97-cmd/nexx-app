import { MobileCaseDetailTopBar, MobileFactsList } from '@/components/case-mobile';
import { getMobileCaseWorkspaceData } from '@/lib/mobile/caseWorkspaceData';

type MobileFactsPageProps = {
  params: Promise<{ caseId: string }>;
};

/** Full mobile key facts route. */
export default async function MobileFactsPage({ params }: MobileFactsPageProps) {
  const { caseId } = await params;
  const data = getMobileCaseWorkspaceData(caseId);

  return (
    <div className="light min-h-dvh bg-neutral-50 text-neutral-900">
      <MobileCaseDetailTopBar title="Key Facts" caseId={caseId} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-4">
        <MobileFactsList facts={data.facts} />
      </main>
    </div>
  );
}

