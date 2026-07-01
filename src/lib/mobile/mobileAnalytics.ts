'use client';

type MobileAnalyticsEvent =
  | 'mobile_generate_report_tapped'
  | 'mobile_report_sheet_opened'
  | 'mobile_report_build_started'
  | 'mobile_report_build_succeeded'
  | 'mobile_report_build_failed'
  | 'mobile_docuvault_opened_from_workspace';

type MobileAnalyticsMetadata = {
  caseId?: string;
  draftId?: string;
  status?: string;
  durationMs?: number;
  screenWidthBucket?: string;
};

/** Group viewport widths into the mobile QA buckets from the contract. */
function getScreenWidthBucket() {
  if (typeof window === 'undefined') return undefined;
  const width = window.innerWidth;
  if (width <= 320) return '320';
  if (width <= 360) return '360';
  if (width <= 375) return '375';
  if (width <= 390) return '390';
  if (width <= 414) return '414';
  if (width <= 430) return '430';
  return '431_plus';
}

/** Emits metadata-only mobile quality events without sensitive case text. */
export function trackMobileEvent(
  eventName: MobileAnalyticsEvent,
  metadata: MobileAnalyticsMetadata = {},
) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent('nexproof:mobile-analytics', {
    detail: {
      eventName,
      ...metadata,
      screenWidthBucket: metadata.screenWidthBucket ?? getScreenWidthBucket(),
      occurredAt: new Date().toISOString(),
    },
  }));
}
