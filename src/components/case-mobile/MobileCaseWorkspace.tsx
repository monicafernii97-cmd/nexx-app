'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BriefcaseBusiness, Menu, MoreHorizontal } from 'lucide-react';
import {
  MobileBottomSheet,
  MobileDrawer,
  MobileIconButton,
  MobileOfflineBanner,
  MobileTopBar,
  type MobileDrawerItem,
} from '@/components/mobile-shell';
import type { MobileCaseWorkspaceData } from '@/lib/mobile/caseWorkspaceData';
import { trackMobileEvent } from '@/lib/mobile/mobileAnalytics';
import { useMobileScrollRestoration } from '@/lib/mobile/useMobileScrollRestoration';
import { MobileCaseSnapshotCard } from './MobileCaseSnapshotCard';
import { MobileFactsCarousel } from './MobileFactsCarousel';
import { MobileGenerateReportBar } from './MobileGenerateReportBar';
import { MobileGenerateReportSheet } from './MobileGenerateReportSheet';
import { MobileNarrativePreview } from './MobileNarrativePreview';
import { MobilePatternsSection } from './MobilePatternsSection';
import { MobileTimelineSnapshot } from './MobileTimelineSnapshot';

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
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isReportSheetOpen, setIsReportSheetOpen] = useState(false);
  const router = useRouter();

  useMobileScrollRestoration({ key: `workspace:${data.caseId}` });

  useEffect(() => {
    try {
      trackMobileEvent('mobile_workspace_viewed', { caseId: data.caseId });
    } catch {
      // Analytics should never block local workspace recovery state.
    }
    try {
      window.localStorage.setItem('mobile-last-opened-case', data.caseId);
    } catch {
      // Last-opened case persistence is best-effort.
    }
  }, [data.caseId]);

  const openDocuVault = () => {
    const searchParams = new URLSearchParams({
      source: 'workspace_mobile',
      caseId: data.caseId,
    });
    router.push(`/docuvault?${searchParams.toString()}`);
  };

  return (
    <div className="light min-h-dvh bg-neutral-50 text-neutral-900">
      <MobileTopBar
        title={data.caseName}
        left={
          <MobileIconButton label="Open menu" onClick={() => setIsDrawerOpen(true)}>
            <Menu aria-hidden="true" className="h-5 w-5" />
          </MobileIconButton>
        }
        right={
          <MobileIconButton
            label="Open workspace actions"
            onClick={() => setIsActionsOpen(true)}
          >
            <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
          </MobileIconButton>
        }
      />
      <MobileOfflineBanner caseId={data.caseId} />

      <MobileDrawer
        isOpen={isDrawerOpen}
        title={data.caseName}
        items={buildDrawerItems(data.caseId, 'Workspace')}
        onClose={() => setIsDrawerOpen(false)}
      />

      <MobileBottomSheet
        isOpen={isActionsOpen}
        title="Workspace Actions"
        description="Open related case tools without losing your place."
        onClose={() => setIsActionsOpen(false)}
      >
        <div className="space-y-2">
          <button
            type="button"
            className="flex min-h-11 w-full items-center rounded-2xl border border-neutral-200 px-4 text-left text-sm font-semibold text-neutral-900 active:bg-neutral-100"
            onClick={openDocuVault}
          >
            Open DocuVault
          </button>
          <button
            type="button"
            className="flex min-h-11 w-full items-center rounded-2xl border border-neutral-200 px-4 text-left text-sm font-semibold text-neutral-900 active:bg-neutral-100"
            onClick={() => router.push(`/settings?caseId=${encodeURIComponent(data.caseId)}`)}
          >
            Open Settings
          </button>
        </div>
      </MobileBottomSheet>

      <MobileGenerateReportSheet
        caseId={data.caseId}
        isOpen={isReportSheetOpen}
        onClose={() => setIsReportSheetOpen(false)}
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
          trackMobileEvent('mobile_generate_report_tapped', { caseId: data.caseId });
          setIsReportSheetOpen(true);
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
        <MobileIconButton label="Go back" onClick={() => router.back()}>
          <ArrowLeft aria-hidden="true" className="h-5 w-5" />
        </MobileIconButton>
      }
      right={
        <MobileIconButton
          label="Open workspace"
          onClick={() => router.push(`/case/${caseId}/workspace`)}
        >
          <BriefcaseBusiness aria-hidden="true" className="h-5 w-5" />
        </MobileIconButton>
      }
    />
  );
}
