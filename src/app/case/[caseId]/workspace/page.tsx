import { MobileCaseWorkspace } from '@/components/case-mobile';
import { getMobileCaseWorkspaceData } from '@/lib/mobile/caseWorkspaceData';

type MobileWorkspacePageProps = {
  params: Promise<{ caseId: string }>;
};

/** Mobile-first case workspace route. */
export default async function MobileWorkspacePage({ params }: MobileWorkspacePageProps) {
  const { caseId } = await params;
  const data = getMobileCaseWorkspaceData(caseId);

  return <MobileCaseWorkspace data={data} />;
}

