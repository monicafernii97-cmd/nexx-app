import { MobileEvidenceScreen } from '@/components/evidence-mobile';
import { MobileCaseUtilityTopBar } from '@/components/mobile-shell';
import { getMobileCaseUtilityData } from '@/lib/mobile/caseUtilityData';

type MobileEvidencePageProps = {
  params: Promise<{ caseId: string }>;
};

/** Mobile evidence route for reviewing and adding source materials. */
export default async function MobileEvidencePage({ params }: MobileEvidencePageProps) {
  const { caseId } = await params;
  const data = getMobileCaseUtilityData(caseId);

  return (
    <div className="light min-h-dvh bg-neutral-50 text-neutral-900">
      <MobileCaseUtilityTopBar title="Evidence" caseId={caseId} />
      <MobileEvidenceScreen caseId={caseId} evidence={data.evidence} />
    </div>
  );
}
