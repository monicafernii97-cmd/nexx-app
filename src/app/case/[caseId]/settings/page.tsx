import { MobileCaseUtilityTopBar, MobileOfflineBanner } from '@/components/mobile-shell';
import { MobileSettingsScreen } from '@/components/settings-mobile';
import { getMobileCaseUtilityData } from '@/lib/mobile/caseUtilityData';

type MobileSettingsPageProps = {
  params: Promise<{ caseId: string }>;
};

/** Mobile case settings route with grouped 48px interaction rows. */
export default async function MobileSettingsPage({ params }: MobileSettingsPageProps) {
  const { caseId } = await params;
  const data = getMobileCaseUtilityData(caseId);

  return (
    <div className="light min-h-dvh bg-neutral-50 text-neutral-900">
      <MobileCaseUtilityTopBar title="Settings" caseId={caseId} />
      <MobileOfflineBanner caseId={caseId} />
      <MobileSettingsScreen groups={data.settingsGroups} />
    </div>
  );
}
