import { MobileCaseUtilityTopBar } from '@/components/mobile-shell';
import { MobileReportsScreen } from '@/components/reports-mobile';
import { getMobileCaseUtilityData } from '@/lib/mobile/caseUtilityData';

type MobileReportsPageProps = {
  params: Promise<{ caseId: string }>;
};

/** Mobile reports route for resuming drafts and viewing prior exports. */
export default async function MobileReportsPage({ params }: MobileReportsPageProps) {
  const { caseId } = await params;
  const data = getMobileCaseUtilityData(caseId);

  return (
    <div className="light min-h-dvh bg-neutral-50 text-neutral-900">
      <MobileCaseUtilityTopBar title="Reports" caseId={caseId} />
      <MobileReportsScreen key={caseId} caseId={caseId} reports={data.reports} />
    </div>
  );
}
