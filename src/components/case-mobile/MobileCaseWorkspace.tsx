'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BriefcaseBusiness, Menu, MoreHorizontal } from 'lucide-react';
import {
  MobileDrawer,
  MobileIconButton,
  MobileTopBar,
  type MobileDrawerItem,
} from '@/components/mobile-shell';
import type { MobileCaseWorkspaceData } from '@/lib/mobile/caseWorkspaceData';
import {
  MobileCaseSnapshotCard,
  MobileFactsCarousel,
  MobileGenerateReportBar,
  MobileNarrativePreview,
  MobilePatternsSection,
  MobileTimelineSnapshot,
} from './index';

type MobileCaseWorkspaceProps = {
  data: MobileCaseWorkspaceData;
};

function buildDrawerItems(caseId: string, active: string): MobileDrawerItem[] {
  const routes = [
    ['Workspace', `/case/${caseId}/workspace`],
    ['Timeline', `/case/${caseId}/timeline`],
    ['Evidence', `/case/${caseId}/evidence`],
    ['Messages', `/case/${caseId}/messages`],
    ['DocuVault', `/case/${caseId}/docuvault`],
    ['Reports', `/case/${caseId}/reports`],
    ['Settings', `/case/${caseId}/settings`],
  ] as const;

  return routes.map(([label, href]) => ({
    label,
    href,
    isActive: active === label,
  }));
}

/** Contract-compliant single-column mobile workspace screen. */
export function MobileCaseWorkspace({ data }: MobileCaseWorkspaceProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="light min-h-dvh bg-neutral-50 text-neutral-900">
      <MobileTopBar
        title={data.caseName}
        titleActionLabel="Select case"
        onTitleAction={() => undefined}
        left={
          <MobileIconButton label="Open menu" onClick={() => setIsDrawerOpen(true)}>
            <Menu aria-hidden="true" className="h-5 w-5" />
          </MobileIconButton>
        }
        right={
          <MobileIconButton label="More actions">
            <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
          </MobileIconButton>
        }
      />

      <MobileDrawer
        isOpen={isDrawerOpen}
        title={data.caseName}
        items={buildDrawerItems(data.caseId, 'Workspace')}
        onClose={() => setIsDrawerOpen(false)}
      />

      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4">
        <MobileCaseSnapshotCard
          title={data.caseName}
          factsCount={data.facts.length}
          eventsCount={data.timeline.length}
          supportedPatternsCount={data.patterns.length}
          lastUpdated={data.lastUpdated}
        />
        <MobileFactsCarousel caseId={data.caseId} facts={data.facts} />
        <MobileTimelineSnapshot caseId={data.caseId} events={data.timeline} />
        <MobilePatternsSection patterns={data.patterns} />
        <MobileNarrativePreview caseId={data.caseId} previewText={data.summaryPreview} />
      </main>

      <MobileGenerateReportBar
        onGenerateReport={() => {
          router.push(`/case/${data.caseId}/workspace?report=1`);
        }}
      />
    </div>
  );
}

type MobileCaseDetailTopBarProps = {
  title: string;
  caseId: string;
};

/** Shared top bar for secondary mobile case screens. */
export function MobileCaseDetailTopBar({ title, caseId }: MobileCaseDetailTopBarProps) {
  const router = useRouter();

  return (
    <MobileTopBar
      title={title}
      left={
        <MobileIconButton label="Go back" onClick={() => router.push(`/case/${caseId}/workspace`)}>
          <ArrowLeft aria-hidden="true" className="h-5 w-5" />
        </MobileIconButton>
      }
      right={
        <MobileIconButton label="More actions">
          <BriefcaseBusiness aria-hidden="true" className="h-5 w-5" />
        </MobileIconButton>
      }
    />
  );
}
