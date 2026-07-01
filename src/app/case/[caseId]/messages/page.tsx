import { MobileMessagesScreen } from '@/components/messages-mobile';
import { MobileCaseUtilityTopBar } from '@/components/mobile-shell';
import { getMobileCaseUtilityData } from '@/lib/mobile/caseUtilityData';

type MobileMessagesPageProps = {
  params: Promise<{ caseId: string }>;
};

/** Mobile message evidence route with search and filters. */
export default async function MobileMessagesPage({ params }: MobileMessagesPageProps) {
  const { caseId } = await params;
  const data = getMobileCaseUtilityData(caseId);

  return (
    <div className="light min-h-dvh bg-neutral-50 text-neutral-900">
      <MobileCaseUtilityTopBar title="Messages" caseId={caseId} />
      <MobileMessagesScreen caseId={caseId} messages={data.messages} />
    </div>
  );
}
