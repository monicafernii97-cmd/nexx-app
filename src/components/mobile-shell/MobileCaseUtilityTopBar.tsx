'use client';

import { ArrowLeft, MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { MobileIconButton, MobileTopBar } from './MobileTopBar';

type MobileCaseUtilityTopBarProps = {
  title: string;
  caseId: string;
  rightLabel?: string;
  onRightAction?: () => void;
};

/** Secondary case top bar with back navigation and an optional overflow action. */
export function MobileCaseUtilityTopBar({
  title,
  caseId,
  rightLabel = 'More actions',
  onRightAction,
}: MobileCaseUtilityTopBarProps) {
  const router = useRouter();

  return (
    <MobileTopBar
      title={title}
      left={
        <MobileIconButton
          label="Go back"
          onClick={() => {
            if (window.history.length > 1) {
              router.back();
              return;
            }
            router.push(`/case/${caseId}/workspace`);
          }}
        >
          <ArrowLeft aria-hidden="true" className="h-5 w-5" />
        </MobileIconButton>
      }
      right={
        <MobileIconButton
          label={rightLabel}
          onClick={onRightAction ?? (() => router.push(`/case/${caseId}/workspace`))}
        >
          <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
        </MobileIconButton>
      }
    />
  );
}
