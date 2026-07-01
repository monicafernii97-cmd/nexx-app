import { MobileCaseDetailTopBar, MobileTimelineScreen } from '@/components/case-mobile';
import { getMobileCaseWorkspaceData } from '@/lib/mobile/caseWorkspaceData';

type MobileTimelinePageProps = {
  params: Promise<{ caseId: string }>;
};

/** Full mobile timeline route. */
export default async function MobileTimelinePage({ params }: MobileTimelinePageProps) {
  const { caseId } = await params;
  const data = getMobileCaseWorkspaceData(caseId);

  return (
    <div className="light min-h-dvh bg-neutral-50 text-neutral-900">
      <MobileCaseDetailTopBar title="Timeline" caseId={caseId} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-4">
        <MobileTimelineScreen events={data.timeline} />
      </main>
    </div>
  );
}

