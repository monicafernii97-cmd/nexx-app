'use client';

import {
  assertMobileAnalyticsMetadataSafe,
  getMobileWidthBucket,
} from './mobileContractQa';

type MobileAnalyticsEvent =
  | 'mobile_workspace_viewed'
  | 'mobile_facts_carousel_swiped'
  | 'mobile_fact_view_all_tapped'
  | 'mobile_timeline_expand_tapped'
  | 'mobile_summary_expand_tapped'
  | 'mobile_generate_report_tapped'
  | 'mobile_report_sheet_opened'
  | 'mobile_report_build_started'
  | 'mobile_report_build_succeeded'
  | 'mobile_report_build_failed'
  | 'mobile_docuvault_opened_from_workspace'
  | 'mobile_pdf_preview_opened'
  | 'mobile_pdf_preview_failed'
  | 'mobile_export_started'
  | 'mobile_export_succeeded'
  | 'mobile_export_failed'
  | 'mobile_add_evidence_tapped'
  | 'mobile_offline_detected'
  | 'mobile_connection_restored';

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
  return getMobileWidthBucket(window.innerWidth);
}

/** Emits metadata-only mobile quality events without sensitive case text. */
export function trackMobileEvent(
  eventName: MobileAnalyticsEvent,
  metadata: MobileAnalyticsMetadata = {},
) {
  if (typeof window === 'undefined') return;
  assertMobileAnalyticsMetadataSafe(metadata as Record<string, unknown>);

  window.dispatchEvent(new CustomEvent('nexproof:mobile-analytics', {
    detail: {
      eventName,
      ...metadata,
      screenWidthBucket: metadata.screenWidthBucket ?? getScreenWidthBucket(),
      occurredAt: new Date().toISOString(),
    },
  }));
}
