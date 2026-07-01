'use client';

import { MobileBottomActionBar, MobilePrimaryActionButton } from '@/components/mobile-shell';

type MobileGenerateReportBarProps = {
  onGenerateReport?: () => void;
};

/** Sticky mobile workspace CTA for the report generation flow. */
export function MobileGenerateReportBar({ onGenerateReport }: MobileGenerateReportBarProps) {
  return (
    <MobileBottomActionBar>
      <MobilePrimaryActionButton onClick={onGenerateReport}>
        Generate Report
      </MobilePrimaryActionButton>
    </MobileBottomActionBar>
  );
}

